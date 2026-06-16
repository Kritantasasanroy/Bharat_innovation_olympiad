import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, BookingStatus, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDemoExam } from '../common/demo-exams';

// Fields returned to students — correctAnswer intentionally excluded
const QUESTION_SELECT = {
    id: true,
    type: true,
    difficulty: true,
    text: true,
    options: true,
    marks: true,
    negativeMarks: true,
    timeLimitSecs: true,
    mediaUrl: true,
    mediaType: true,
    tags: true,
    explanation: true,
} as const;

// ── Scoring strategies ──

interface ScoringResult {
    isCorrect: boolean;
    score: number;
}

function scoreMcq(question: any, answer: string): ScoringResult {
    const options = question.options as { id?: string; text: string; isCorrect: boolean }[];
    const correctIdx = options?.findIndex((o) => o.isCorrect);
    if (correctIdx === -1 || correctIdx === undefined) return { isCorrect: false, score: 0 };
    const correctId = options[correctIdx]?.id || correctIdx.toString();
    const isCorrect = correctId === answer;
    return { isCorrect, score: isCorrect ? question.marks : -question.negativeMarks };
}

function scoreMultiSelect(question: any, answer: string[]): ScoringResult {
    const options = question.options as { id: string; isCorrect: boolean }[];
    const correctIds = options?.filter((o) => o.isCorrect).map((o) => o.id) || [];
    const selected = Array.isArray(answer) ? answer : [];
    const allCorrect = correctIds.every((id) => selected.includes(id));
    const noExtra = selected.every((id) => correctIds.includes(id));
    const isCorrect = allCorrect && noExtra && correctIds.length > 0;
    return { isCorrect, score: isCorrect ? question.marks : -question.negativeMarks };
}

function scoreTrueFalse(question: any, answer: string): ScoringResult {
    // correctAnswer stored as 'true' or 'false' string
    const isCorrect = String(answer).toLowerCase() === String(question.correctAnswer).toLowerCase();
    return { isCorrect, score: isCorrect ? question.marks : -question.negativeMarks };
}

function scoreShortAnswer(question: any, answer: string): ScoringResult {
    const isCorrect =
        String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
    return { isCorrect, score: isCorrect ? question.marks : 0 };
}

function scoreNumeric(question: any, answer: string): ScoringResult {
    const tolerance = question.tolerance ?? 0;
    const submitted = parseFloat(String(answer));
    const correct = parseFloat(String(question.correctAnswer));
    const isCorrect = !isNaN(submitted) && Math.abs(submitted - correct) <= tolerance;
    return { isCorrect, score: isCorrect ? question.marks : 0 };
}

function scoreQuestion(question: any, answer: any): ScoringResult {
    switch (question.type as QuestionType) {
        case QuestionType.MCQ:
            return scoreMcq(question, answer);
        case QuestionType.TRUE_FALSE:
            return scoreTrueFalse(question, answer);
        case QuestionType.MULTI_SELECT:
            return scoreMultiSelect(question, answer);
        case QuestionType.SHORT_ANSWER:
            return scoreShortAnswer(question, answer);
        case QuestionType.NUMERIC:
            return scoreNumeric(question, answer);
        default:
            return scoreMcq(question, answer);
    }
}

@Injectable()
export class AttemptService {
    constructor(private prisma: PrismaService) { }

    // ── Seeded PRNG helpers ─────────────────────────────────────────────────

    // FNV-1a 32-bit — stable string → unsigned int
    private fnvHash(str: string): number {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // Deterministic Fisher-Yates using xorshift32 seeded from fnvHash
    private seededShuffle<T>(arr: T[], seed: string): T[] {
        let s = this.fnvHash(seed);
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
            s ^= s << 13; s ^= s >> 17; s ^= s << 5; s = s >>> 0;
            const j = s % (i + 1);
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    // Builds the per-student ordered question list from exam sections.
    //
    // Pool model: each section contains the full question pool (e.g. 100 Qs).
    // questionsToAssign (e.g. 50) tells how many each student actually gets.
    // Selection is seeded with userId+examId+sectionId so:
    //   - Same student always gets the same subset (stable across refreshes)
    //   - Different students get different subsets from the same pool
    //   - A final cross-section shuffle ensures unique ordering even when two
    //     students receive identical question subsets.
    //
    // Difficulty-bucket selection:
    //   - Targets easyPct% / mediumPct% / hardPct% of questionsToAssign
    //   - Any deficit (bucket too small) is filled from the shuffled leftover pool
    private buildQuestionSet(
        sections: Array<{
            id: string;
            questionsToAssign: number;
            sectionQuestions: Array<{ sortOrder: number; question: any }>;
        }>,
        examId: string,
        userId: string,
        easyPct: number,
        mediumPct: number,
        hardPct: number,
    ): any[] {
        const result: any[] = [];

        for (const section of sections) {
            const all = section.sectionQuestions
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((sq) => sq.question)
                .filter(Boolean);

            if (all.length === 0) continue;

            const seed = `${userId}:${examId}:${section.id}`;

            // questionsToAssign=0 means "assign all" (backward-compatible default)
            const target = section.questionsToAssign > 0
                ? Math.min(section.questionsToAssign, all.length)
                : all.length;

            const easy   = all.filter((q: any) => q.difficulty === 'EASY');
            const medium = all.filter((q: any) => q.difficulty === 'MEDIUM');
            const hard   = all.filter((q: any) => q.difficulty === 'HARD');

            const easyN   = Math.min(Math.round(easyPct   / 100 * target), easy.length);
            const mediumN = Math.min(Math.round(mediumPct / 100 * target), medium.length);
            const hardN   = Math.min(Math.round(hardPct   / 100 * target), hard.length);

            const selected: any[] = [
                ...this.seededShuffle(easy,   seed + ':e').slice(0, easyN),
                ...this.seededShuffle(medium, seed + ':m').slice(0, mediumN),
                ...this.seededShuffle(hard,   seed + ':h').slice(0, hardN),
            ];

            // Fill any deficit (bucket too small) from the shuffled leftover pool
            const selectedIds = new Set(selected.map((q: any) => q.id));
            const leftover = this.seededShuffle(
                all.filter((q: any) => !selectedIds.has(q.id)),
                seed + ':fill',
            );
            const deficit = target - selected.length;
            if (deficit > 0) selected.push(...leftover.slice(0, deficit));

            result.push(...selected);
        }

        // Final cross-section shuffle: ensures no two students see questions
        // in the same order even when they receive the same subset from each pool.
        return this.seededShuffle(result, `${userId}:${examId}:order`);
    }

    // Fetches exam sections, runs buildQuestionSet, then pre-creates AttemptItems
    // with sortOrder so the question set is fixed for the lifetime of the attempt.
    private async initializeQuestionSet(
        attemptId: string,
        examId: string,
        userId: string,
    ): Promise<any[]> {
        const exam = await this.prisma.exam.findUnique({
            where: { id: examId },
            include: {
                sections: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        sectionQuestions: {
                            orderBy: { sortOrder: 'asc' },
                            include: { question: { select: QUESTION_SELECT } },
                        },
                        // questionsToAssign is on ExamSection — included automatically
                    },
                },
            },
        });

        if (!exam) throw new NotFoundException('Exam not found');

        const questions = this.buildQuestionSet(
            exam.sections,
            examId,
            userId,
            exam.easyPct,
            exam.mediumPct,
            exam.hardPct,
        );

        await this.prisma.attemptItem.createMany({
            data: questions.map((q: any, idx: number) => ({
                attemptId,
                questionId: q.id,
                sortOrder: idx,
            })),
            skipDuplicates: true,
        });

        return questions;
    }

    async startAttempt(userId: string, instanceId: string, ipAddress?: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });

        if (!instance) throw new NotFoundException('Exam instance not found');

        const now = new Date();
        if (now < instance.startsAt) throw new BadRequestException('Exam has not started yet');
        if (now > instance.endsAt) throw new BadRequestException('Exam window has closed');

        // Slot booking gate — skip for demo exams; skip if exam has no slots
        if (!isDemoExam(instance.examId)) {
            const hasSlots = await this.prisma.examSlot.count({ where: { examInstanceId: instanceId } });
            if (hasSlots > 0) {
                const booking = await this.prisma.booking.findFirst({
                    where: {
                        userId,
                        status: BookingStatus.CONFIRMED,
                        slot: { examInstanceId: instanceId },
                    },
                    include: { slot: true },
                });
                if (!booking) {
                    throw new ForbiddenException('You need a confirmed slot booking to start this exam');
                }
                if (now < booking.slot.startsAt || now > booking.slot.endsAt) {
                    throw new ForbiddenException('You are outside your booked slot window');
                }
            }
        }

        if (isDemoExam(instance.examId)) {
            return this.startDemoAttempt(userId, instance, now, ipAddress);
        }

        // ── Resume an in-progress attempt ──
        const existing = await this.prisma.attempt.findUnique({
            where: { userId_examInstanceId: { userId, examInstanceId: instanceId } },
            include: {
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: { question: { select: QUESTION_SELECT } },
                },
            },
        });

        if (existing) {
            if (existing.status === AttemptStatus.IN_PROGRESS) {
                if (existing.items.length > 0) {
                    // Normal resume — derive questions from pre-stored items
                    const questions = existing.items.map((i) => i.question).filter(Boolean);
                    const items = existing.items.map(({ question: _q, ...rest }) => rest);
                    return { attempt: { ...existing, items }, questions };
                }
                // Legacy attempt (created before question-set feature) — initialize now
                const questions = await this.initializeQuestionSet(existing.id, instance.examId, userId);
                const items = await this.prisma.attemptItem.findMany({
                    where: { attemptId: existing.id },
                    orderBy: { sortOrder: 'asc' },
                });
                return { attempt: { ...existing, items }, questions };
            }
            if (existing.status !== AttemptStatus.NOT_STARTED) {
                throw new BadRequestException('You have already completed this exam');
            }
        }

        // ── Create (or re-activate NOT_STARTED) attempt ──
        try {
            const attempt = await this.prisma.attempt.upsert({
                where: { userId_examInstanceId: { userId, examInstanceId: instanceId } },
                create: {
                    userId,
                    examInstanceId: instanceId,
                    status: AttemptStatus.IN_PROGRESS,
                    startedAt: now,
                    ipAddress,
                    maxScore: instance.exam.totalMarks,
                },
                update: {
                    status: AttemptStatus.IN_PROGRESS,
                    startedAt: now,
                    ipAddress,
                },
                include: { items: true },
            });

            const questions = await this.initializeQuestionSet(attempt.id, instance.examId, userId);
            return { attempt, questions };
        } catch (error: any) {
            // P2002: concurrent request already created the attempt
            if (error.code === 'P2002') {
                const concurrent = await this.prisma.attempt.findUnique({
                    where: { userId_examInstanceId: { userId, examInstanceId: instanceId } },
                    include: {
                        items: {
                            orderBy: { sortOrder: 'asc' },
                            include: { question: { select: QUESTION_SELECT } },
                        },
                    },
                });
                if (concurrent) {
                    const questions = concurrent.items.map((i) => i.question).filter(Boolean);
                    const items = concurrent.items.map(({ question: _q, ...rest }) => rest);
                    return { attempt: { ...concurrent, items }, questions };
                }
            }
            throw error;
        }
    }

    // Demo exams keep at most one attempt per (user, exam): any stale
    // attempts on other instances of the same exam are pruned, and a
    // finished attempt on the current instance is reset in place so its
    // ID — and therefore the student's single result row — persists.
    private async startDemoAttempt(
        userId: string,
        instance: { id: string; examId: string; exam: { totalMarks: number } },
        now: Date,
        ipAddress?: string,
    ) {
        const prior = await this.prisma.attempt.findMany({
            where: { userId, examInstance: { examId: instance.examId } },
            orderBy: { createdAt: 'desc' },
        });

        const current = prior.find(a => a.examInstanceId === instance.id);
        const staleIds = prior
            .filter(a => a.examInstanceId !== instance.id)
            .map(a => a.id);
        if (staleIds.length) {
            await this.prisma.attempt.deleteMany({ where: { id: { in: staleIds } } });
        }

        // ── Resume in-progress demo attempt ──
        if (current && current.status === AttemptStatus.IN_PROGRESS) {
            const items = await this.prisma.attemptItem.findMany({
                where: { attemptId: current.id },
                orderBy: { sortOrder: 'asc' },
                include: { question: { select: QUESTION_SELECT } },
            });
            const questions = items.map((i) => i.question).filter(Boolean);
            const plainItems = items.map(({ question: _q, ...rest }) => rest);

            if (questions.length > 0) {
                return { attempt: { ...current, items: plainItems }, questions };
            }
            // Legacy demo attempt with no pre-stored items — initialize now
            const generatedQs = await this.initializeQuestionSet(current.id, instance.examId, userId);
            const freshItems = await this.prisma.attemptItem.findMany({
                where: { attemptId: current.id },
                orderBy: { sortOrder: 'asc' },
            });
            return { attempt: { ...current, items: freshItems }, questions: generatedQs };
        }

        // ── Reset a finished demo attempt ──
        let attemptId: string;
        if (current) {
            await this.prisma.attemptItem.deleteMany({ where: { attemptId: current.id } });
            await this.prisma.proctorEvent.deleteMany({ where: { attemptId: current.id } });
            const reset = await this.prisma.attempt.update({
                where: { id: current.id },
                data: {
                    status: AttemptStatus.IN_PROGRESS,
                    startedAt: now,
                    submittedAt: null,
                    totalScore: null,
                    maxScore: instance.exam.totalMarks,
                    ipAddress,
                },
            });
            attemptId = reset.id;
        } else {
            const created = await this.prisma.attempt.create({
                data: {
                    userId,
                    examInstanceId: instance.id,
                    status: AttemptStatus.IN_PROGRESS,
                    startedAt: now,
                    ipAddress,
                    maxScore: instance.exam.totalMarks,
                },
            });
            attemptId = created.id;
        }

        const questions = await this.initializeQuestionSet(attemptId, instance.examId, userId);
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: { items: { orderBy: { sortOrder: 'asc' } } },
        });
        return { attempt, questions };
    }

    async saveAnswer(attemptId: string, userId: string, questionId: string, answer: any) {
        // Validate attempt belongs to user and is active
        const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
        if (!attempt) throw new NotFoundException();
        if (attempt.userId !== userId) throw new ForbiddenException();
        if (attempt.status !== AttemptStatus.IN_PROGRESS) {
            throw new BadRequestException('Attempt is not active');
        }

        // Upsert answer
        return this.prisma.attemptItem.upsert({
            where: { attemptId_questionId: { attemptId, questionId } },
            create: {
                attemptId,
                questionId,
                answer,
                answeredAt: new Date(),
            },
            update: {
                answer,
                answeredAt: new Date(),
            },
        });
    }

    async submitAttempt(attemptId: string, userId: string) {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: {
                items: { include: { question: true } },
                examInstance: true,
            },
        });

        if (!attempt) throw new NotFoundException();
        if (attempt.userId !== userId) throw new ForbiddenException();
        if (attempt.status !== AttemptStatus.IN_PROGRESS) {
            throw new BadRequestException('Attempt is not active');
        }

        // Score all answers
        let totalScore = 0;
        for (const item of attempt.items) {
            if (item.answer != null) {
                const result = scoreQuestion(item.question, item.answer);
                totalScore += result.score;

                await this.prisma.attemptItem.update({
                    where: { id: item.id },
                    data: { isCorrect: result.isCorrect, score: result.score },
                });
            }
        }

        // Update attempt
        const updated = await this.prisma.attempt.update({
            where: { id: attemptId },
            data: {
                status: AttemptStatus.SUBMITTED,
                submittedAt: new Date(),
                totalScore,
            },
        });

        return {
            ...updated,
            redirectUrl: attempt.examInstance.quitUrl || undefined,
        };
    }

    async autoSubmit(attemptId: string) {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: { items: { include: { question: true } } },
        });

        if (!attempt || attempt.status !== AttemptStatus.IN_PROGRESS) return;

        let totalScore = 0;
        for (const item of attempt.items) {
            if (item.answer != null) {
                const result = scoreQuestion(item.question, item.answer);
                totalScore += result.score;
                await this.prisma.attemptItem.update({
                    where: { id: item.id },
                    data: { isCorrect: result.isCorrect, score: result.score },
                });
            }
        }

        await this.prisma.attempt.update({
            where: { id: attemptId },
            data: {
                status: AttemptStatus.AUTO_SUBMITTED,
                submittedAt: new Date(),
                totalScore,
            },
        });
    }

    async getResults(userId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
            },
            include: {
                examInstance: {
                    include: {
                        exam: {
                            include: {
                                sections: {
                                    include: {
                                        sectionQuestions: {
                                            include: { question: { select: { marks: true } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                items: {
                    include: { question: true }
                }
            },
            orderBy: {
                submittedAt: 'desc',
            },
        });

        const results = [];
        for (const attempt of attempts) {
            const score = attempt.totalScore || 0;
            const rankCount = await this.prisma.attempt.count({
                where: {
                    examInstanceId: attempt.examInstanceId,
                    status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
                    totalScore: { gt: score }
                }
            });
            const totalStudents = await this.prisma.attempt.count({
                where: {
                    examInstanceId: attempt.examInstanceId,
                    status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] }
                }
            });

            // If exam has no attempts somehow, default to 1/1. But count includes this student so minimum is 1.
            const rank = rankCount + 1;

            // Build questionId -> sectionId map from this exam's SectionQuestion rows.
            const questionToSection: Record<string, string> = {};
            attempt.examInstance.exam.sections.forEach(sec => {
                sec.sectionQuestions.forEach(sq => { questionToSection[sq.questionId] = sec.id; });
            });

            // Generate section-wise scores for Radar chart.
            // Pre-populate total from ALL questions in each section (not just
            // the ones the student attempted) so a student who answers 1/10
            // questions correctly shows 10%, not 100%.
            const sectionScoresMap: Record<string, { total: number, scored: number, name: string }> = {};
            attempt.examInstance.exam.sections.forEach(sec => {
                const totalMarks = sec.sectionQuestions.reduce(
                    (sum, sq) => sum + (sq.question?.marks ?? 0), 0
                );
                sectionScoresMap[sec.id] = { total: totalMarks, scored: 0, name: sec.title };
            });

            attempt.items.forEach(item => {
                const sid = questionToSection[item.questionId];
                if (sid && sectionScoresMap[sid]) {
                    sectionScoresMap[sid].scored += (item.score ?? 0);
                }
            });

            const radarData = Object.values(sectionScoresMap).map(sec => ({
                subject: sec.name,
                A: sec.total > 0 ? Math.round((Math.max(0, sec.scored) / sec.total) * 100) : 0,
                fullMark: 100
            }));

            // Fallback if no sections
            if (radarData.length === 0) {
                radarData.push(
                    { subject: 'Accuracy', A: ((score) / (attempt.maxScore || attempt.examInstance.exam.totalMarks || 1)) * 100, fullMark: 100 },
                    { subject: 'Completion', A: (attempt.items.length / 10) * 100, fullMark: 100 },
                    { subject: 'Time', A: 80, fullMark: 100 }
                );
            }

            // Scale rank out of 500
            const rankOutOf500 = totalStudents > 0 ? Math.round((rank / totalStudents) * 500) : rank;

            results.push({
                id: attempt.id,
                title: attempt.examInstance.exam.title,
                score,
                total: attempt.maxScore || attempt.examInstance.exam.totalMarks,
                date: attempt.submittedAt,
                percentage: ((score) / (attempt.maxScore || attempt.examInstance.exam.totalMarks || 1)) * 100,
                isReleased: attempt.examInstance.exam.isResultReleased,
                rank: rankOutOf500,
                totalStudents: 500,
                radarData
            });
        }

        return results;
    }

    async getRecentResults(userId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
            },
            include: {
                examInstance: {
                    include: {
                        exam: true,
                    },
                },
            },
            orderBy: {
                submittedAt: 'desc',
            },
            take: 5,
        });

        return attempts.map((attempt) => ({
            id: attempt.id,
            examTitle: attempt.examInstance.exam.title,
            score: attempt.totalScore || 0,
            totalMarks: attempt.maxScore || attempt.examInstance.exam.totalMarks,
            completedAt: attempt.submittedAt,
            isReleased: attempt.examInstance.exam.isResultReleased,
        }));
    }

    async findById(id: string) {
        return this.prisma.attempt.findUnique({
            where: { id },
            include: { items: true, examInstance: { include: { exam: true } } },
        });
    }

    async getAttemptReportAdmin(attemptId: string) {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: {
                user: {
                    include: { school: true }
                },
                examInstance: {
                    include: {
                        exam: {
                            include: {
                                sections: {
                                    include: {
                                        sectionQuestions: {
                                            include: { question: { select: { marks: true } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                items: {
                    include: { question: true }
                }
            }
        });

        if (!attempt) throw new NotFoundException('Attempt not found');

        const questionToSection: Record<string, string> = {};
        attempt.examInstance.exam.sections.forEach(sec => {
            sec.sectionQuestions.forEach(sq => { questionToSection[sq.questionId] = sec.id; });
        });

        const sectionScoresMap: Record<string, { total: number, scored: number, name: string }> = {};
        attempt.examInstance.exam.sections.forEach(sec => {
            const totalMarks = sec.sectionQuestions.reduce(
                (sum, sq) => sum + (sq.question?.marks ?? 0), 0
            );
            sectionScoresMap[sec.id] = { total: totalMarks, scored: 0, name: sec.title };
        });

        attempt.items.forEach(item => {
            const sid = questionToSection[item.questionId];
            if (sid && sectionScoresMap[sid]) {
                sectionScoresMap[sid].scored += (item.score ?? 0);
            }
        });

        const radarData = Object.values(sectionScoresMap).map(sec => ({
            subject: sec.name,
            A: sec.total > 0 ? Math.round((Math.max(0, sec.scored) / sec.total) * 100) : 0,
            fullMark: 100
        }));

        if (radarData.length === 0) {
            radarData.push(
                { subject: 'Accuracy', A: ((attempt.totalScore || 0) / (attempt.maxScore || attempt.examInstance.exam.totalMarks || 1)) * 100, fullMark: 100 },
                { subject: 'Completion', A: (attempt.items.length / 10) * 100, fullMark: 100 },
                { subject: 'Time', A: 80, fullMark: 100 }
            );
        }

        return {
            attempt,
            radarData
        };
    }
}
