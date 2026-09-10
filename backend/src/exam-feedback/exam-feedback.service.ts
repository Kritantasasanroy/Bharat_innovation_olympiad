import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Below this rating a student must say what went wrong.
 *
 * A one-tap low score with no words behind it tells us something is wrong and
 * nothing about what — which is the least actionable feedback there is. Above
 * it, writing stays optional: a happy student should be able to leave in one
 * tap, and forcing praise out of them only trains people to type "good".
 */
export const FEEDBACK_COMMENT_REQUIRED_BELOW = 3;

/** Long enough to be a sentence rather than "bad". */
export const FEEDBACK_COMMENT_MIN_LENGTH = 20;

@Injectable()
export class ExamFeedbackService {
    constructor(private prisma: PrismaService) {}

    /**
     * Record one student's rating of the olympiad for the attempt they just
     * submitted.
     *
     * Idempotent by attempt: a reload, a double-tap or a back-button re-submit
     * updates the existing row rather than stacking a second rating on the same
     * paper. `attemptId` is verified to belong to the caller, so a student
     * cannot rate somebody else's attempt by guessing an id.
     */
    async submit(userId: string, attemptId: string, rating: number, comment?: string) {
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            throw new BadRequestException('Choose a rating from 1 to 5 stars.');
        }

        const trimmed = (comment ?? '').trim();
        if (rating < FEEDBACK_COMMENT_REQUIRED_BELOW && trimmed.length < FEEDBACK_COMMENT_MIN_LENGTH) {
            throw new BadRequestException(
                `Tell us what went wrong — at least ${FEEDBACK_COMMENT_MIN_LENGTH} characters, so we can actually fix it.`,
            );
        }

        const attempt = await this.prisma.attempt.findFirst({
            where: { id: attemptId, userId },
            select: { id: true, examInstanceId: true },
        });
        if (!attempt) throw new NotFoundException('That attempt does not exist.');

        return this.prisma.examFeedback.upsert({
            where: { attemptId },
            create: {
                userId,
                attemptId,
                examInstanceId: attempt.examInstanceId,
                rating,
                comment: trimmed || null,
            },
            update: { rating, comment: trimmed || null },
            select: { id: true, rating: true, comment: true, createdAt: true },
        });
    }

    /** Has this attempt already been rated? Drives "ask once, never again". */
    async forAttempt(userId: string, attemptId: string) {
        return this.prisma.examFeedback.findFirst({
            where: { attemptId, userId },
            select: { id: true, rating: true, comment: true, createdAt: true },
        });
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /**
     * Every rating, newest first, with the student and the paper it is about.
     *
     * `minRating`/`maxRating` exist so the team can pull just the unhappy ones —
     * the rows that come with a written explanation attached and are worth
     * reading first.
     */
    async adminList(params: { minRating?: number; maxRating?: number; withComment?: boolean } = {}) {
        const { minRating, maxRating, withComment } = params;
        const rows = await this.prisma.examFeedback.findMany({
            where: {
                ...(minRating || maxRating
                    ? { rating: { ...(minRating ? { gte: minRating } : {}), ...(maxRating ? { lte: maxRating } : {}) } }
                    : {}),
                ...(withComment ? { NOT: { comment: null } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
                user: {
                    select: {
                        id: true, firstName: true, lastName: true, email: true,
                        rollNumber: true, classBand: true,
                        school: { select: { name: true } },
                    },
                },
                examInstance: { select: { id: true, exam: { select: { id: true, title: true } } } },
            },
        });

        return rows.map((r) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.createdAt,
            studentId: r.user.id,
            studentName: `${r.user.firstName} ${r.user.lastName}`.trim(),
            studentEmail: r.user.email,
            rollNumber: r.user.rollNumber,
            classBand: r.user.classBand,
            schoolName: r.user.school?.name ?? null,
            examId: r.examInstance.exam.id,
            examTitle: r.examInstance.exam.title,
        }));
    }

    /** Headline numbers for the top of the admin page. */
    async adminSummary() {
        const [count, agg, byRating] = await Promise.all([
            this.prisma.examFeedback.count(),
            this.prisma.examFeedback.aggregate({ _avg: { rating: true } }),
            this.prisma.examFeedback.groupBy({ by: ['rating'], _count: { rating: true } }),
        ]);

        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const row of byRating) distribution[row.rating] = row._count.rating;

        return {
            total: count,
            average: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
            distribution,
        };
    }
}
