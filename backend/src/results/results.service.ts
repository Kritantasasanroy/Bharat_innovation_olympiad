import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeScores } from './normalization';

/** Attempt states that count as "sat the exam" for normalization and certificates. */
export const SUBMITTED_STATUSES = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];

/**
 * Results integrity chain (spec Admin §19 + §20).
 *
 * Two gates, in order:
 *  1. **Normalize** — an automatic, repeatable fair-score run over every
 *     submitted attempt on the instance.
 *  2. **Release** — an audited human decision. It is impossible to release
 *     results that have not been normalized, so students can never see raw,
 *     non-comparable marks.
 */
@Injectable()
export class ResultsService {
    constructor(private prisma: PrismaService) {}

    /** Normalization + release state for one exam instance. */
    async getStatus(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { id: true, title: true, isResultReleased: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const submitted = await this.prisma.attempt.count({
            where: { examInstanceId, status: { in: SUBMITTED_STATUSES } },
        });
        const certificates = await this.prisma.certificate.count({ where: { examInstanceId } });

        return {
            examInstanceId,
            examTitle: instance.exam.title,
            submittedAttempts: submitted,
            certificatesIssued: certificates,
            normalizedAt: instance.resultsNormalizedAt,
            releasedAt: instance.resultsReleasedAt,
            releasedBy: instance.resultsReleasedBy,
            canRelease: Boolean(instance.resultsNormalizedAt) && !instance.resultsReleasedAt,
        };
    }

    /** Every exam instance with its results state — powers the admin results page. */
    async listInstances() {
        const instances = await this.prisma.examInstance.findMany({
            orderBy: { startsAt: 'desc' },
            include: {
                exam: { select: { id: true, title: true, totalMarks: true } },
                _count: { select: { attempts: true, certificates: true } },
            },
        });

        return instances.map((instance) => ({
            id: instance.id,
            examTitle: instance.exam.title,
            startsAt: instance.startsAt,
            attempts: instance._count.attempts,
            certificatesIssued: instance._count.certificates,
            normalizedAt: instance.resultsNormalizedAt,
            releasedAt: instance.resultsReleasedAt,
            canRelease: Boolean(instance.resultsNormalizedAt) && !instance.resultsReleasedAt,
        }));
    }

    /**
     * Fair-score processing. Idempotent: re-running recomputes from raw marks,
     * so a late submission can be folded in by simply normalizing again.
     */
    async normalize(examInstanceId: string, adminId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { totalMarks: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');
        if (instance.resultsReleasedAt) {
            throw new ConflictException(
                'Results are already released; normalization would change published scores.',
            );
        }

        const attempts = await this.prisma.attempt.findMany({
            where: { examInstanceId, status: { in: SUBMITTED_STATUSES } },
            select: { id: true, totalScore: true, maxScore: true },
        });
        if (attempts.length === 0) {
            throw new BadRequestException('No submitted attempts to normalize.');
        }

        const normalized = normalizeScores(
            attempts.map((attempt) => ({
                id: attempt.id,
                rawScore: attempt.totalScore ?? 0,
                maxScore: attempt.maxScore ?? instance.exam.totalMarks ?? 0,
            })),
        );

        const now = new Date();
        await this.prisma.$transaction([
            ...normalized.map((result) =>
                this.prisma.attempt.update({
                    where: { id: result.id },
                    data: {
                        normalizedScore: result.normalizedScore,
                        percentile: result.percentile,
                        rank: result.rank,
                    },
                }),
            ),
            this.prisma.examInstance.update({
                where: { id: examInstanceId },
                data: { resultsNormalizedAt: now },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: 'results.normalized',
                    resource: 'exam-instance',
                    details: { examInstanceId, attempts: normalized.length },
                },
            }),
        ]);

        return { examInstanceId, normalizedAt: now, attempts: normalized.length };
    }

    /**
     * Release gating — the human decision. Requires a completed normalization
     * run and a written reason; both are recorded in the audit log.
     */
    async release(examInstanceId: string, adminId: string, reason: string) {
        if (!reason?.trim()) throw new BadRequestException('A reason is required to release results.');

        const instance = await this.prisma.examInstance.findUnique({ where: { id: examInstanceId } });
        if (!instance) throw new NotFoundException('Exam instance not found');
        if (!instance.resultsNormalizedAt) {
            throw new ConflictException('Results must be normalized before they can be released.');
        }
        if (instance.resultsReleasedAt) {
            throw new ConflictException('Results are already released.');
        }

        const now = new Date();
        await this.prisma.$transaction([
            this.prisma.examInstance.update({
                where: { id: examInstanceId },
                data: { resultsReleasedAt: now, resultsReleasedBy: adminId },
            }),
            // Keeps the legacy student-facing gate (`exam.isResultReleased`) in step.
            this.prisma.exam.update({
                where: { id: instance.examId },
                data: { isResultReleased: true },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: 'results.released',
                    resource: 'exam-instance',
                    details: { examInstanceId, reason: reason.trim() },
                },
            }),
        ]);

        return { examInstanceId, releasedAt: now };
    }
}
