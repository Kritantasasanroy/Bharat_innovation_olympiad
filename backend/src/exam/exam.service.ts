import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus, Prisma } from '@prisma/client';
import { isDemoExam } from '../common/demo-exams';

// ── Deterministic seeded shuffle (Fisher-Yates) ──
// Uses a simple mulberry32 PRNG seeded from the userId hash so each
// student gets a unique but repeatable question order.
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function mulberry32(seed: number) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function seededShuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    const rng = mulberry32(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Project SectionQuestion rows into the legacy `section.questions` shape
// so admin UI doesn't need to know about the join model.
function flattenSection(section: any, includeAnswer = true) {
    const questions = (section.sectionQuestions || [])
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        .map((sq: any) => ({
            ...sq.question,
            sortOrder: sq.sortOrder,
            ...(includeAnswer ? {} : { correctAnswer: undefined }),
        }));
    const { sectionQuestions, ...rest } = section;
    return { ...rest, questions };
}

@Injectable()
export class ExamService {
    constructor(private prisma: PrismaService) { }

    // ── Student-facing ──

    async findAvailableExams(classBand: number, userId: string) {
        const exams = await this.prisma.exam.findMany({
            where: {
                classBands: { has: classBand },
                instances: { some: { endsAt: { gte: new Date() } } },
            },
            include: {
                sections: { select: { id: true, title: true, sortOrder: true } },
                instances: {
                    where: { endsAt: { gte: new Date() } },
                    orderBy: { startsAt: 'asc' },
                    include: { attempts: { where: { userId } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const completedAttempts = await this.prisma.attempt.findMany({
            where: {
                userId,
                status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
                examInstance: { examId: { in: exams.map(e => e.id) } },
            },
            include: { examInstance: { select: { examId: true } } },
        });

        const completedExamIds = new Set(completedAttempts.map(a => a.examInstance.examId));

        return exams.map(exam => ({
            ...exam,
            isCompleted: isDemoExam(exam.id) ? false : completedExamIds.has(exam.id),
        }));
    }

    async findExamById(id: string, userId?: string) {
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
                        sectionQuestions: {
                            orderBy: { sortOrder: 'asc' },
                            include: {
                                question: {
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
                                        explanation: true,
                                        // correctAnswer always excluded at the
                                        // student-facing layer; admin reads it via
                                        // GET /admin/questions
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!exam) throw new NotFoundException('Exam not found');

        const flattenedSections = exam.sections.map(s => flattenSection(s));

        if (userId) {
            const allQuestions = flattenedSections.flatMap(s => s.questions);
            const seed = hashString(userId + exam.id);
            const shuffledQuestions = seededShuffle(allQuestions, seed);
            return {
                ...exam,
                sections: [{
                    id: 'shuffled',
                    title: 'All Questions',
                    sortOrder: 0,
                    examId: exam.id,
                    questions: shuffledQuestions,
                }],
            };
        }

        return { ...exam, sections: flattenedSections };
    }

    async findInstanceById(instanceId: string) {
        return this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });
    }

    // ── Admin: exams ──

    async findAllExamsForAdmin() {
        return this.prisma.exam.findMany({
            include: {
                _count: { select: { sections: true, instances: true } },
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
        feeAmount?: number;
    }) {
        return this.prisma.exam.create({
            data: { ...data, isPublished: true, isResultReleased: true },
        });
    }

    async deleteExam(id: string) {
        await this.prisma.exam.delete({ where: { id } });
    }

    async updateExam(id: string, data: {
        title?: string;
        description?: string | null;
        classBands?: number[];
        totalMarks?: number;
        durationMinutes?: number;
        feeAmount?: number | null;
        isPublished?: boolean;
        isResultReleased?: boolean;
    }) {
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.exam.update({ where: { id }, data });
            if (data.totalMarks !== undefined) {
                await tx.attempt.updateMany({
                    where: { examInstance: { examId: id } },
                    data: { maxScore: data.totalMarks },
                });
            }
            return updated;
        });
    }

    // ── Admin: sections ──

    async createSection(examId: string, data: { title: string; sortOrder: number }) {
        return this.prisma.examSection.create({ data: { ...data, examId } });
    }

    async updateSection(id: string, data: any) {
        return this.prisma.examSection.update({ where: { id }, data });
    }

    async deleteSection(id: string) {
        return this.prisma.examSection.delete({ where: { id } });
    }

    // ── Admin: questions (bank + section) ──

    async createBankQuestion(data: any) {
        const { sortOrder: _a, sectionId: _b, ...payload } = data;
        return this.prisma.question.create({ data: payload });
    }

    async bulkCreateBankQuestions(items: any[]) {
        const created: { id: string }[] = [];
        await this.prisma.$transaction(async (tx) => {
            for (const item of items) {
                const { sortOrder: _a, sectionId: _b, ...payload } = item;
                const q = await tx.question.create({ data: payload, select: { id: true } });
                created.push(q);
            }
        });
        return { count: created.length };
    }

    async createQuestion(sectionId: string, data: any) {
        // Create a new bank question AND attach it to this section.
        const { sortOrder: _ignored, sectionId: _ignored2, ...questionData } = data;
        const existingCount = await this.prisma.sectionQuestion.count({ where: { sectionId } });
        return this.prisma.$transaction(async (tx) => {
            const question = await tx.question.create({ data: questionData });
            await tx.sectionQuestion.create({
                data: { sectionId, questionId: question.id, sortOrder: existingCount },
            });
            return question;
        });
    }

    async bulkCreateQuestions(sectionId: string, items: any[]) {
        const existingCount = await this.prisma.sectionQuestion.count({ where: { sectionId } });
        const created: { id: string }[] = [];
        // createMany doesn't return rows; loop so we can wire up SectionQuestion.
        await this.prisma.$transaction(async (tx) => {
            for (let i = 0; i < items.length; i++) {
                const { sortOrder: _a, sectionId: _b, ...payload } = items[i];
                const q = await tx.question.create({ data: payload, select: { id: true } });
                await tx.sectionQuestion.create({
                    data: { sectionId, questionId: q.id, sortOrder: existingCount + i },
                });
                created.push(q);
            }
        });
        return { count: created.length };
    }

    async updateQuestion(id: string, data: any) {
        // Editing a question edits the bank entry. sortOrder/sectionId are
        // ignored here — those live on SectionQuestion.
        const { sortOrder: _a, sectionId: _b, ...payload } = data;
        return this.prisma.question.update({ where: { id }, data: payload });
    }

    async deleteQuestion(id: string) {
        // Cascades to SectionQuestion rows.
        return this.prisma.question.delete({ where: { id } });
    }

    async listBankQuestions(filters: { q?: string; difficulty?: string; examId?: string }) {
        const where: Prisma.QuestionWhereInput = {};
        if (filters.q) where.text = { contains: filters.q, mode: 'insensitive' };
        if (filters.difficulty && ['EASY', 'MEDIUM', 'HARD'].includes(filters.difficulty)) {
            where.difficulty = filters.difficulty as any;
        }
        if (filters.examId) {
            where.sectionLinks = { some: { section: { examId: filters.examId } } };
        }
        return this.prisma.question.findMany({
            where,
            include: {
                sectionLinks: {
                    select: {
                        sectionId: true,
                        sortOrder: true,
                        section: { select: { id: true, title: true, examId: true, exam: { select: { id: true, title: true } } } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
    }

    async attachQuestionToSection(sectionId: string, questionId: string) {
        const existing = await this.prisma.sectionQuestion.findUnique({
            where: { sectionId_questionId: { sectionId, questionId } },
        });
        if (existing) throw new BadRequestException('Question already attached to this section');
        const count = await this.prisma.sectionQuestion.count({ where: { sectionId } });
        return this.prisma.sectionQuestion.create({
            data: { sectionId, questionId, sortOrder: count },
        });
    }

    async detachQuestionFromSection(sectionId: string, questionId: string) {
        return this.prisma.sectionQuestion.delete({
            where: { sectionId_questionId: { sectionId, questionId } },
        });
    }

    async reorderSectionQuestion(sectionId: string, questionId: string, sortOrder: number) {
        return this.prisma.sectionQuestion.update({
            where: { sectionId_questionId: { sectionId, questionId } },
            data: { sortOrder },
        });
    }

    async moveQuestionAcrossSections(
        sourceSectionId: string,
        questionId: string,
        targetSectionId: string,
    ) {
        if (sourceSectionId === targetSectionId) return { moved: false };
        return this.prisma.$transaction(async (tx) => {
            await tx.sectionQuestion.delete({
                where: { sectionId_questionId: { sectionId: sourceSectionId, questionId } },
            });
            const existing = await tx.sectionQuestion.findUnique({
                where: { sectionId_questionId: { sectionId: targetSectionId, questionId } },
            });
            if (existing) return { moved: true, alreadyAttached: true };
            const count = await tx.sectionQuestion.count({ where: { sectionId: targetSectionId } });
            await tx.sectionQuestion.create({
                data: { sectionId: targetSectionId, questionId, sortOrder: count },
            });
            return { moved: true };
        });
    }

    // ── Admin: instances ──

    async listInstances(examId: string) {
        return this.prisma.examInstance.findMany({
            where: { examId },
            orderBy: { startsAt: 'asc' },
            include: { _count: { select: { attempts: true } } },
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
        return this.prisma.examInstance.create({ data: { ...data, examId } });
    }

    async updateInstance(id: string, data: {
        startsAt?: Date;
        endsAt?: Date;
        requireSeb?: boolean;
        browserExamKey?: string;
        configKey?: string;
        quitUrl?: string;
    }) {
        return this.prisma.examInstance.update({ where: { id }, data });
    }

    async deleteInstance(id: string) {
        return this.prisma.examInstance.delete({ where: { id } });
    }

    async publishExam(id: string) {
        return this.prisma.exam.update({ where: { id }, data: { isPublished: true } });
    }

    async releaseQuestionPaper(id: string) {
        return this.prisma.exam.update({ where: { id }, data: { isPublished: true } });
    }

    async releaseResults(id: string) {
        return this.prisma.exam.update({ where: { id }, data: { isResultReleased: true } });
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
