import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ── Scoring strategies ──

interface ScoringResult {
    isCorrect: boolean;
    score: number;
}

function scoreMcq(question: any, answer: string): ScoringResult {
    const options = question.options as { id: string; isCorrect: boolean }[];
    const correct = options?.find((o) => o.isCorrect);
    const isCorrect = correct?.id === answer;
    return {
        isCorrect,
        score: isCorrect ? question.marks : -question.negativeMarks,
    };
}

function scoreMultiSelect(question: any, answer: string[]): ScoringResult {
    const options = question.options as { id: string; isCorrect: boolean }[];
    const correctIds = options?.filter((o) => o.isCorrect).map((o) => o.id) || [];
    const selected = answer || [];
    const allCorrect = correctIds.every((id) => selected.includes(id));
    const noExtra = selected.every((id) => correctIds.includes(id));
    const isCorrect = allCorrect && noExtra;
    return {
        isCorrect,
        score: isCorrect ? question.marks : -question.negativeMarks,
    };
}

function scoreQuestion(question: any, answer: any): ScoringResult {
    switch (question.type) {
        case QuestionType.MCQ:
        case QuestionType.TRUE_FALSE:
            return scoreMcq(question, answer);
        case QuestionType.MULTI_SELECT:
            return scoreMultiSelect(question, answer);
        case QuestionType.SHORT_ANSWER:
            const isCorrect = String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
            return { isCorrect, score: isCorrect ? question.marks : 0 };
        case QuestionType.NUMERIC:
            const numCorrect = parseFloat(answer) === parseFloat(question.correctAnswer);
            return { isCorrect: numCorrect, score: numCorrect ? question.marks : 0 };
        default:
            return { isCorrect: false, score: 0 };
    }
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
                examInstance: {
                    exam: {
                        isResultReleased: true,
                    },
                },
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
        });

        return attempts.map((attempt) => ({
            id: attempt.id,
            title: attempt.examInstance.exam.title,
            score: attempt.totalScore || 0,
            total: attempt.maxScore || attempt.examInstance.exam.totalMarks,
            date: attempt.submittedAt,
            percentage:
                ((attempt.totalScore || 0) / (attempt.maxScore || attempt.examInstance.exam.totalMarks || 1)) * 100,
        }));
    }

    async getRecentResults(userId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
                examInstance: {
                    exam: {
                        isResultReleased: true,
                    },
                },
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
