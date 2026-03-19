import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExamService {
    constructor(private prisma: PrismaService) { }

    // ── Student-facing ──

    async findAvailableExams(classBand: number) {
        return this.prisma.exam.findMany({
            where: {
                isPublished: true,
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
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findExamById(id: string) {
        const exam = await this.prisma.exam.findUnique({
            where: { id },
            include: {
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
        return this.prisma.exam.create({ data });
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
