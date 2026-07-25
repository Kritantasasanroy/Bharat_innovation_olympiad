import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canReleaseResults } from '../exam/exam-lifecycle';
import { normalizeScores } from './normalization';

/** Attempt states that count as "sat the exam" for normalization and certificates. */
export const SUBMITTED_STATUSES = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];

/** Who a result release is visible to. Each is granted and revoked separately. */
export type ResultAudience = 'STUDENTS' | 'SCHOOLS' | 'PARTNERS';

export const RESULT_AUDIENCES: ResultAudience[] = ['STUDENTS', 'SCHOOLS', 'PARTNERS'];

/** The `ExamInstance` column that records each audience's release. */
export const AUDIENCE_FIELD = {
    STUDENTS: 'resultsReleasedToStudentsAt',
    SCHOOLS: 'resultsReleasedToSchoolsAt',
    PARTNERS: 'resultsReleasedToPartnersAt',
} as const satisfies Record<ResultAudience, string>;

const labelOf = (audience: ResultAudience) => audience.toLowerCase();

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

        const now = new Date();
        const gate = canReleaseResults({
            instance,
            normalizedAt: instance.resultsNormalizedAt,
            now,
        });

        return {
            examInstanceId,
            examTitle: instance.exam.title,
            startsAt: instance.startsAt,
            endsAt: instance.endsAt,
            hasEnded: now > instance.endsAt,
            submittedAttempts: submitted,
            certificatesIssued: certificates,
            normalizedAt: instance.resultsNormalizedAt,
            releasedAt: instance.resultsReleasedAt,
            releasedBy: instance.resultsReleasedBy,
            releasedTo: {
                STUDENTS: instance.resultsReleasedToStudentsAt,
                SCHOOLS: instance.resultsReleasedToSchoolsAt,
                PARTNERS: instance.resultsReleasedToPartnersAt,
            },
            canRelease: gate.ok,
            /** Why the Release button is disabled, so the admin UI need not guess. */
            releaseBlockedReason: gate.ok ? null : gate.reason,
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

        const now = new Date();

        return instances.map((instance) => {
            const gate = canReleaseResults({
                instance,
                normalizedAt: instance.resultsNormalizedAt,
                now,
            });
            return {
                id: instance.id,
                examTitle: instance.exam.title,
                startsAt: instance.startsAt,
                endsAt: instance.endsAt,
                hasEnded: now > instance.endsAt,
                attempts: instance._count.attempts,
                certificatesIssued: instance._count.certificates,
                normalizedAt: instance.resultsNormalizedAt,
                releasedAt: instance.resultsReleasedAt,
                releasedTo: {
                    STUDENTS: instance.resultsReleasedToStudentsAt,
                    SCHOOLS: instance.resultsReleasedToSchoolsAt,
                    PARTNERS: instance.resultsReleasedToPartnersAt,
                },
                canRelease: gate.ok,
                releaseBlockedReason: gate.ok ? null : gate.reason,
            };
        });
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
     * Release gating — the human decision.
     *
     * Three things must hold, and the first is the one that was missing: **the
     * exam must actually be over**. Releasing mid-window publishes a rank and a
     * percentile computed over whoever happened to have submitted so far, and
     * tells students still sitting the paper what they "scored".
     *
     * Release is **per audience** (item 19). Students, schools and partners are
     * released to independently and incrementally: a school can be given the
     * results to sanity-check a day before students see them, and a partner may
     * never be given them at all. Calling this again with a new audience adds it
     * rather than re-releasing the ones already out.
     */
    async release(
        examInstanceId: string,
        adminId: string,
        reason: string,
        audiences: ResultAudience[] = ['STUDENTS'],
    ) {
        if (!reason?.trim()) throw new BadRequestException('A reason is required to release results.');
        if (!audiences.length) {
            throw new BadRequestException('Pick at least one audience to release results to.');
        }

        const instance = await this.prisma.examInstance.findUnique({ where: { id: examInstanceId } });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const now = new Date();
        const check = canReleaseResults({
            instance,
            normalizedAt: instance.resultsNormalizedAt,
            now,
        });
        if (!check.ok) throw new ConflictException(check.reason);

        const already = audiences.filter((a) => instance[AUDIENCE_FIELD[a]] !== null);
        if (already.length === audiences.length) {
            throw new ConflictException(
                `Results are already released to ${already.map(labelOf).join(' and ')}.`,
            );
        }

        const toRelease = audiences.filter((a) => instance[AUDIENCE_FIELD[a]] === null);
        const data: Record<string, Date | string> = {
            resultsReleasedBy: adminId,
            // The first release of any audience stamps the instance as released.
            ...(instance.resultsReleasedAt ? {} : { resultsReleasedAt: now }),
        };
        for (const audience of toRelease) data[AUDIENCE_FIELD[audience]] = now;

        await this.prisma.$transaction([
            this.prisma.examInstance.update({ where: { id: examInstanceId }, data }),
            // The legacy student-facing gate (`exam.isResultReleased`) tracks the
            // STUDENTS audience only — releasing to a school must not hand students
            // their scores as a side effect.
            ...(toRelease.includes('STUDENTS')
                ? [
                      this.prisma.exam.update({
                          where: { id: instance.examId },
                          data: { isResultReleased: true },
                      }),
                  ]
                : []),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: 'results.released',
                    resource: 'exam-instance',
                    details: { examInstanceId, reason: reason.trim(), audiences: toRelease },
                },
            }),
        ]);

        return { examInstanceId, releasedAt: now, released: toRelease };
    }

    /**
     * Takes results back from an audience (item 19 — "limited access").
     *
     * Used when results go out and turn out to be wrong. Revoking from students
     * also flips the legacy `Exam.isResultReleased` back off, so the student
     * result pages close again immediately.
     */
    async revoke(
        examInstanceId: string,
        adminId: string,
        reason: string,
        audiences: ResultAudience[],
    ) {
        if (!reason?.trim()) throw new BadRequestException('A reason is required to revoke results.');
        if (!audiences.length) throw new BadRequestException('Pick at least one audience.');

        const instance = await this.prisma.examInstance.findUnique({ where: { id: examInstanceId } });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const data: Record<string, null> = {};
        for (const audience of audiences) data[AUDIENCE_FIELD[audience]] = null;

        await this.prisma.$transaction([
            this.prisma.examInstance.update({ where: { id: examInstanceId }, data }),
            ...(audiences.includes('STUDENTS')
                ? [
                      this.prisma.exam.update({
                          where: { id: instance.examId },
                          data: { isResultReleased: false },
                      }),
                  ]
                : []),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: 'results.revoked',
                    resource: 'exam-instance',
                    details: { examInstanceId, reason: reason.trim(), audiences },
                },
            }),
        ]);

        return { examInstanceId, revoked: audiences };
    }
}
