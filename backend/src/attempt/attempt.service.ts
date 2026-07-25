import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttemptStatus, BookingStatus, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDemoExam } from '../common/demo-exams';
import { examPhase, isStartable, startRefusalReason } from '../exam/exam-lifecycle';
import { AccessPassService } from '../payment/access-pass.service';

// Fields returned to students — correctAnswer intentionally excluded.
//
// The Olympiad-format columns are split deliberately. `sectionName`, `topic` and
// `futureReadyInsight` are part of what the student is meant to see; the
// authoring fields (learningObjective, competency, metadata → Canva prompt,
// reviewer comments) are not, and stay out of the payload rather than being
// filtered client-side. `correctAnswer` likewise never leaves the server.
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
    imageUrl: true,
    videoUrl: true,
    tags: true,
    explanation: true,
    externalId: true,
    partCode: true,
    partName: true,
    sectionCode: true,
    sectionName: true,
    topic: true,
    questionCategory: true,
    bloomLevel: true,
    futureReadyInsight: true,
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
    private readonly logger = new Logger(AttemptService.name);

    constructor(
        private prisma: PrismaService,
        private accessPassService: AccessPassService,
    ) { }

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
    //   - Shuffling happens *within* each section, so two students still see a
    //     different order without the paper losing its structure.
    //
    // Section order is preserved and never shuffled. The paper is sat one
    // section at a time — all of "Entrepreneurship Mindset", then all of
    // "Problem Solving & Innovation", and so on — and the student is shown which
    // section they are in. A cross-section shuffle used to run here, which made
    // the section headings meaningless because consecutive questions came from
    // different pillars.
    //
    // Difficulty-bucket selection:
    //   - Targets easyPct% / mediumPct% / hardPct% of questionsToAssign
    //   - Any deficit (bucket too small) is filled from the shuffled leftover pool
    private buildQuestionSet(
        sections: Array<{
            id: string;
            title: string;
            sortOrder: number;
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

        const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
        for (const [sectionIndex, section] of ordered.entries()) {
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

            // Shuffle inside the section so ordering still varies per student,
            // then stamp each question with the section it belongs to. The
            // stamp is what lets the player draw headings and group its
            // navigator without a second round-trip.
            const shuffled = this.seededShuffle(selected, `${seed}:order`);
            result.push(
                ...shuffled.map((q: any) => ({
                    ...q,
                    sectionId: section.id,
                    sectionTitle: section.title,
                    sectionIndex,
                })),
            );
        }

        return result;
    }

    /**
     * Re-attaches section identity to questions loaded from stored AttemptItems.
     *
     * `AttemptItem` records only `questionId` and `sortOrder`, so a resumed
     * attempt would otherwise come back with no section headings at all — the
     * student would see a differently-shaped exam after a refresh than the one
     * they started. The join table is the source of truth for membership.
     */
    private async decorateWithSections(examId: string, questions: any[]): Promise<any[]> {
        if (questions.length === 0) return questions;

        const links = await this.prisma.sectionQuestion.findMany({
            where: {
                questionId: { in: questions.map((q) => q.id) },
                section: { examId },
            },
            select: {
                questionId: true,
                section: { select: { id: true, title: true, sortOrder: true } },
            },
        });

        const bySortOrder = [...new Set(links.map((l) => l.section.sortOrder))].sort((a, b) => a - b);
        const byQuestion = new Map(links.map((l) => [l.questionId, l.section]));

        return questions.map((q) => {
            const section = byQuestion.get(q.id);
            if (!section) return q;
            return {
                ...q,
                sectionId: section.id,
                sectionTitle: section.title,
                sectionIndex: bySortOrder.indexOf(section.sortOrder),
            };
        });
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
        // Face enrollment is required before starting any proctored exam —
        // this is enforced here (not just at registration) so a student can
        // never reach the exam player unenrolled, regardless of how their
        // account was created or whether the frontend gate was bypassed.
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { faceEmbedding: true },
        });
        if (!user?.faceEmbedding) {
            throw new ForbiddenException('FACE_ENROLLMENT_REQUIRED');
        }

        const instance = await this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });

        if (!instance) throw new NotFoundException('Exam instance not found');

        const now = new Date();

        // The authoritative start gate. It re-derives the phase from the same pure
        // rules the exam list uses (`exam-lifecycle.ts`), so a student cannot start
        // an exam by calling this endpoint directly — publication, the exam window
        // and the student's own slot window are all checked here, server-side,
        // regardless of what the UI showed.
        // The trial paper is exempt from exactly the same gates as a practice
        // exam — it is free, needs no slot, and may be retaken as often as the
        // student likes. It has to be, since it is the thing standing between
        // them and the exam they *have* paid and booked for.
        const demo = isDemoExam(instance.examId) || instance.exam.isTrial;

        // The paywall. Every route into the exam player funnels through
        // startAttempt, so checking here — rather than in the UI — is what
        // makes it unbypassable: a student calling this endpoint directly,
        // deep-linking to /play, or replaying an old attempt id all land here.
        // Practice exams stay free by design.
        if (!demo && !(await this.accessPassService.hasActivePass(userId))) {
            throw new ForbiddenException('ACCESS_PASS_REQUIRED');
        }

        // The rehearsal gate. A student must sit the trial paper — same
        // fullscreen, webcam and proctoring as the real thing — before a real
        // exam will start. Enforced here rather than in the UI for the same
        // reason as the paywall above: every route into the player, including a
        // deep link straight to /play, funnels through this method.
        //
        // `requiresTrial` defaults to true, which means every pre-existing exam
        // acquires this gate the moment the column is added. So the gate only
        // engages when a trial paper actually exists to satisfy it — otherwise
        // a deploy that lands before the trial is configured would make every
        // exam on the platform permanently unstartable, with no way out from
        // inside the product.
        if (!demo && !instance.exam.isTrial && instance.exam.requiresTrial) {
            const trialExam = await this.prisma.exam.findFirst({
                where: { isTrial: true, isArchived: false },
                select: { id: true },
            });
            if (trialExam) {
                const sat = await this.prisma.trialCompletion.findUnique({
                    where: { userId_examInstanceId: { userId, examInstanceId: instanceId } },
                    select: { id: true },
                });
                if (!sat) throw new ForbiddenException('TRIAL_REQUIRED');
            } else {
                this.logger.warn(
                    `Exam ${instance.examId} requires a trial but no trial paper is configured — ` +
                        'gate skipped. Create and publish a trial exam, or set requiresTrial=false.',
                );
            }
        }

        const booking = demo
            ? null
            : await this.prisma.booking.findFirst({
                  where: {
                      userId,
                      status: BookingStatus.CONFIRMED,
                      slot: { examInstanceId: instanceId },
                  },
                  include: { slot: true },
              });

        const hasSlots = demo
            ? false
            : (await this.prisma.examSlot.count({ where: { examInstanceId: instanceId } })) > 0;

        const phase = examPhase({
            // A demo/practice exam is exempt from the publication gate by design —
            // it exists to be taken at will and is never listed as a real exam.
            isPublished: demo ? true : instance.exam.isPublished,
            instance,
            slot: booking?.slot ?? null,
            hasSlots,
            now,
        });

        if (!isStartable(phase)) {
            const reason = startRefusalReason(phase) ?? 'This exam cannot be started right now.';
            // A missing slot or a closed slot window is an authorisation failure;
            // the exam simply not being open yet is a bad request.
            if (phase === 'NEEDS_SLOT' || phase === 'SLOT_UPCOMING' || phase === 'SLOT_MISSED') {
                throw new ForbiddenException(reason);
            }
            throw new BadRequestException(reason);
        }

        if (demo) {
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
                    // Normal resume — derive questions from pre-stored items.
                    // AttemptItem carries no section, so re-attach it or the
                    // resumed paper loses every heading it started with.
                    const questions = await this.decorateWithSections(
                        instance.examId,
                        existing.items.map((i) => i.question).filter(Boolean),
                    );
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
                    const questions = await this.decorateWithSections(
                        instance.examId,
                        concurrent.items.map((i) => i.question).filter(Boolean),
                    );
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
            const questions = await this.decorateWithSections(
                instance.examId,
                items.map((i) => i.question).filter(Boolean),
            );
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

    /**
     * Whether this student still owes a rehearsal for a given exam instance.
     *
     * Advisory only — the instructions page uses it to route them to the trial
     * instead of letting them fail at the start gate. `startAttempt` re-checks.
     */
    async getTrialStatus(userId: string, examInstanceId?: string) {
        if (!examInstanceId) return { required: false, completed: false };

        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: { exam: { select: { isTrial: true, requiresTrial: true, id: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const required =
            !instance.exam.isTrial &&
            instance.exam.requiresTrial &&
            !isDemoExam(instance.exam.id);
        if (!required) return { required: false, completed: true };

        const done = await this.prisma.trialCompletion.findUnique({
            where: { userId_examInstanceId: { userId, examInstanceId } },
            select: { completedAt: true },
        });
        return { required: true, completed: Boolean(done), completedAt: done?.completedAt ?? null };
    }

    /**
     * Mark the rehearsal as done for one real exam instance.
     *
     * `examInstanceId` arrives from the client, so nothing is written until the
     * caller is shown to have actually submitted the trial. Without that check
     * this endpoint *is* the bypass it exists to prevent.
     */
    async recordTrialCompletion(userId: string, examInstanceId: string) {
        if (!examInstanceId) throw new BadRequestException('examInstanceId is required.');

        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { isTrial: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');
        if (instance.exam.isTrial) {
            throw new BadRequestException('The trial exam does not itself require a trial.');
        }

        const sat = await this.prisma.attempt.findFirst({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
                examInstance: { exam: { isTrial: true } },
            },
            select: { id: true },
        });
        if (!sat) {
            throw new ForbiddenException(
                'Complete the trial test before starting the exam.',
            );
        }

        await this.prisma.trialCompletion.upsert({
            where: { userId_examInstanceId: { userId, examInstanceId } },
            create: { userId, examInstanceId },
            update: {},
        });
        return { ok: true };
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
