import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ── Scoring strategies ──

interface ScoringResult {
    isCorrect: boolean;
    score: number;
}

function scoreMcq(question: any, answer: string): ScoringResult {
    const options = question.options as { id?: string; text: string; isCorrect: boolean }[];
    const correctIdx = options?.findIndex((o) => o.isCorrect);
    if (correctIdx === -1 || correctIdx === undefined) return { isCorrect: false, score: 0 };
    
    // Fallback to stringified index since options might not have a hardcoded 'id' property
    const correctId = options[correctIdx]?.id || correctIdx.toString();
    const isCorrect = correctId === answer;
    return {
        isCorrect,
        score: isCorrect ? question.marks : -question.negativeMarks,
    };
}

function scoreQuestion(question: any, answer: any): ScoringResult {
    // Only MCQ is supported
    return scoreMcq(question, answer);
}

@Injectable()
export class AttemptService {
    constructor(private prisma: PrismaService) { }

    async startAttempt(userId: string, instanceId: string, ipAddress?: string) {
        // Check if instance exists and is within time window
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });

        if (!instance) throw new NotFoundException('Exam instance not found');

        const now = new Date();
        if (now < instance.startsAt) throw new BadRequestException('Exam has not started yet');
        if (now > instance.endsAt) throw new BadRequestException('Exam window has closed');

        // Check for existing attempt
        const existing = await this.prisma.attempt.findUnique({
            where: { userId_examInstanceId: { userId, examInstanceId: instanceId } },
            include: { items: true },
        });

        if (existing) {
            if (existing.status === AttemptStatus.IN_PROGRESS) {
                return existing; // Resume existing attempt
            }
            if (existing.status !== AttemptStatus.NOT_STARTED) {
                throw new BadRequestException('You have already completed this exam');
            }
        }

        // Create or update attempt
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

        return attempt;
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
                            include: { sections: true }
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

            // Generate section-wise scores for Radar chart
            const sectionScoresMap: Record<string, { total: number, scored: number, name: string }> = {};
            attempt.examInstance.exam.sections.forEach(sec => {
                sectionScoresMap[sec.id] = { total: 0, scored: 0, name: sec.title };
            });

            attempt.items.forEach(item => {
                if (item.question.sectionId && sectionScoresMap[item.question.sectionId]) {
                    sectionScoresMap[item.question.sectionId].total += item.question.marks;
                    if (item.score) {
                        sectionScoresMap[item.question.sectionId].scored += item.score;
                    }
                }
            });

            const radarData = Object.values(sectionScoresMap).map(sec => ({
                subject: sec.name,
                A: sec.total > 0 ? Math.round((sec.scored / sec.total) * 100) : 0,
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
                isReleased: true,
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
        }));
    }

    async findById(id: string) {
        return this.prisma.attempt.findUnique({
            where: { id },
            include: { items: true, examInstance: { include: { exam: true } } },
        });
    }
}
