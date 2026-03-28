import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus } from '@prisma/client';

@Injectable()
export class ExamService {
    constructor(private prisma: PrismaService) { }

    // ── Student-facing ──

    async findAvailableExams(classBand: number, userId: string) {
        const exams = await this.prisma.exam.findMany({
            where: {
                classBands: { has: classBand },
                instances: {
                    some: {
                        endsAt: { gte: new Date() },
                    },
                },
            },
            include: {
                sections: { select: { id: true, title: true, sortOrder: true } },
                instances: {
                    where: { endsAt: { gte: new Date() } },
                    orderBy: { startsAt: 'asc' },
                    include: {
                        attempts: {
                            where: { userId }
                        }
                    }
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Find if user already completed the exam in any instance (past or current)
        const completedAttempts = await this.prisma.attempt.findMany({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
                examInstance: { examId: { in: exams.map(e => e.id) } }
            },
            include: { examInstance: { select: { examId: true } } }
        });

        const completedExamIds = new Set(completedAttempts.map(a => a.examInstance.examId));
        console.log('User ID:', userId);
        console.log('Completed Exam IDs Set:', Array.from(completedExamIds));
        console.log('First exam ID in list:', exams[0]?.id);

        return exams.map(exam => ({
            ...exam,
            isCompleted: completedExamIds.has(exam.id)
        }));
    }

    async findExamById(id: string) {
        const exam = await this.prisma.exam.findUnique({
            where: { id },
            include: {
                instances: {
                    where: { endsAt: { gte: new Date() } },
                    orderBy: { startsAt: 'asc' },
                },
                sections: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        questions: {
                            select: {
                                id: true,
                                type: true,
                                difficulty: true,
                                text: true,
                                options: true,
                                marks: true,
                                negativeMarks: true,
                                timeLimitSecs: true,
                                tags: true,
                                // Exclude correctAnswer and explanation during exam
                            },
                        },
                    },
                },
            },
        });

        if (!exam) throw new NotFoundException('Exam not found');
        return exam;
    }

    async findInstanceById(instanceId: string) {
        return this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });
    }

    // ── Admin operations ──

    async findAllExamsForAdmin() {
        return this.prisma.exam.findMany({
            include: {
                _count: {
                    select: {
                        sections: true,
                        instances: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createExam(data: {
        title: string;
        description?: string;
        classBands: number[];
        totalMarks: number;
        durationMinutes: number;
    }) {
        return this.prisma.exam.create({ 
            data: {
                ...data,
                isPublished: true,
                isResultReleased: true,
            }
        });
    }

    async deleteExam(id: string) {
        // Delete all related data via cascading, then delete the exam
        await this.prisma.exam.delete({
            where: { id },
        });
    }

    async createSection(examId: string, data: { title: string; sortOrder: number }) {
        return this.prisma.examSection.create({
            data: { ...data, examId },
        });
    }

    async createQuestion(sectionId: string, data: any) {
        return this.prisma.question.create({
            data: { ...data, sectionId },
        });
    }

    async updateSection(id: string, data: any) {
        return this.prisma.examSection.update({
            where: { id },
            data,
        });
    }

    async deleteSection(id: string) {
        return this.prisma.examSection.delete({
            where: { id },
        });
    }

    async updateQuestion(id: string, data: any) {
        return this.prisma.question.update({
            where: { id },
            data,
        });
    }

    async deleteQuestion(id: string) {
        return this.prisma.question.delete({
            where: { id },
        });
    }

    async createInstance(examId: string, data: {
        startsAt: Date;
        endsAt: Date;
        requireSeb?: boolean;
        browserExamKey?: string;
        configKey?: string;
        quitUrl?: string;
    }) {
        return this.prisma.examInstance.create({
            data: { ...data, examId },
        });
    }

    async publishExam(id: string) {
        return this.prisma.exam.update({
            where: { id },
            data: { isPublished: true },
        });
    }

    async releaseQuestionPaper(id: string) {
        return this.prisma.exam.update({
            where: { id },
            data: { isPublished: true },
        });
    }

    async releaseResults(id: string) {
        return this.prisma.exam.update({
            where: { id },
            data: { isResultReleased: true },
        });
    }

    // ── Admin analytics ──

    async getExamAnalytics(examId: string) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                examInstance: { examId },
                status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
            },
            select: { totalScore: true, maxScore: true, submittedAt: true },
        });

        const scores = attempts.map((a) => a.totalScore || 0);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        return {
            totalAttempts: attempts.length,
            averageScore: Math.round(avgScore * 100) / 100,
            highestScore: Math.max(...scores, 0),
            lowestScore: Math.min(...scores, 0),
        };
    }
}
