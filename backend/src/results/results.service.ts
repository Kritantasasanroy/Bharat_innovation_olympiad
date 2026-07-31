import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { canReleaseResults } from '../exam/exam-lifecycle';
import { normalizeScores } from './normalization';

/**
 * Attempt states that count as "sat the exam" for normalization and certificates.
 *
 * `DISQUALIFIED` is deliberately absent. That single omission is what removes a
 * disqualified attempt from normalization, from the rank and percentile
 * computation, from certificate issue, and from the school and partner result
 * exports — every one of those queries filters on a list like this one, and none
 * of them lists `DISQUALIFIED`. So disqualifying an attempt is a single status
 * write, with no exclusion logic to remember to add in six places.
 *
 * The one place that must NOT inherit the exclusion is the student's own results
 * list: a disqualified student needs to see that they were disqualified, and a
 * route to appeal it. `AttemptService.getResults` therefore queries for it
 * explicitly rather than reusing this list.
 */
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
    private readonly logger = new Logger(ResultsService.name);

    constructor(
        private prisma: PrismaService,
        private notifications: NotificationService,
    ) {}

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
            // ── Stage two ──
            finalResultsReleasedAt: instance.finalResultsReleasedAt,
            answerKeyReleasedAt: instance.answerKeyReleasedAt,
            canPublishFinal: gate.ok && Boolean(instance.resultsReleasedToStudentsAt),
            publishFinalBlockedReason: !gate.ok
                ? gate.reason
                : !instance.resultsReleasedToStudentsAt
                  ? 'Release provisional results to students first.'
                  : null,
            disqualifiedAttempts: await this.prisma.attempt.count({
                where: { examInstanceId, status: AttemptStatus.DISQUALIFIED },
            }),
            /**
             * Reviews still open. Publishing a final report while a proctoring
             * review is outstanding is exactly how a rank gets published and then
             * changed, so the admin UI warns on this.
             */
            pendingReviews: await this.prisma.attempt.count({
                where: { examInstanceId, reviewStatus: 'PENDING' },
            }),
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

        // Review and disqualification counts for every instance in one grouped
        // query rather than two per row — this list is polled every 10 seconds by
        // the admin page, so N+1 here would be N+1 forever.
        const [pendingByInstance, disqualifiedByInstance] = await Promise.all([
            this.prisma.attempt.groupBy({
                by: ['examInstanceId'],
                where: { reviewStatus: 'PENDING' },
                _count: { _all: true },
            }),
            this.prisma.attempt.groupBy({
                by: ['examInstanceId'],
                where: { status: AttemptStatus.DISQUALIFIED },
                _count: { _all: true },
            }),
        ]);
        const countOf = (rows: { examInstanceId: string; _count: { _all: number } }[], id: string) =>
            rows.find((r) => r.examInstanceId === id)?._count._all ?? 0;

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
                // ── Stage two ──
                finalResultsReleasedAt: instance.finalResultsReleasedAt,
                answerKeyReleasedAt: instance.answerKeyReleasedAt,
                canPublishFinal:
                    gate.ok &&
                    Boolean(instance.resultsReleasedToStudentsAt) &&
                    !instance.finalResultsReleasedAt,
                publishFinalBlockedReason: !gate.ok
                    ? gate.reason
                    : !instance.resultsReleasedToStudentsAt
                      ? 'Release provisional results to students first.'
                      : instance.finalResultsReleasedAt
                        ? 'The final report is already published.'
                        : null,
                pendingReviews: countOf(pendingByInstance as any, instance.id),
                disqualifiedAttempts: countOf(disqualifiedByInstance as any, instance.id),
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

    // ── Stage two: the final report ───────────────────────────────────────────

    /**
     * Publishes the final report — the second, later gate.
     *
     * ## Why releasing to students is not enough on its own
     *
     * `release(…, ['STUDENTS'])` publishes a score, but that score is still
     * **provisional**: a proctoring review can disqualify attempts and an upheld
     * grievance can change a mark, and both of those move everybody else's rank.
     * Telling a student their rank is "3rd" and then silently making it 4th is
     * worse than saying "provisional" for a fortnight.
     *
     * So this is the separate, audited decision that the season is settled. Only
     * after it do final score, rank, percentile, section analysis and the answer
     * key become visible ("Unverified score displayed. Final scores, rank,
     * analysis, Answer key in report after the season ends").
     *
     * ## Why the answer key is a separate column
     *
     * An admin may legitimately want the analysis out while a re-sit is still
     * pending for a handful of students, and publishing the key would hand those
     * students the paper. `withAnswerKey: false` allows exactly that.
     */
    async publishFinalReport(
        examInstanceId: string,
        adminId: string,
        reason: string,
        withAnswerKey = true,
    ) {
        if (!reason?.trim()) {
            throw new BadRequestException('A reason is required to publish the final report.');
        }

        const instance = await this.prisma.examInstance.findUnique({ where: { id: examInstanceId } });
        if (!instance) throw new NotFoundException('Exam instance not found');

        // The same window/normalization gate as a release — a "final" report for
        // an exam still in progress is a contradiction.
        const check = canReleaseResults({
            instance,
            normalizedAt: instance.resultsNormalizedAt,
            now: new Date(),
        });
        if (!check.ok) throw new ConflictException(check.reason);

        // Final results are the *upgrade* of a provisional score. Publishing them
        // to a cohort that has never been given a provisional score at all would
        // skip the stage the two-stage design exists to provide.
        if (!instance.resultsReleasedToStudentsAt) {
            throw new ConflictException(
                'Release provisional results to students first, then publish the final report.',
            );
        }

        if (instance.finalResultsReleasedAt) {
            throw new ConflictException('The final report is already published for this exam.');
        }

        const now = new Date();
        await this.prisma.$transaction([
            this.prisma.examInstance.update({
                where: { id: examInstanceId },
                data: {
                    finalResultsReleasedAt: now,
                    finalReleasedBy: adminId,
                    ...(withAnswerKey ? { answerKeyReleasedAt: now } : {}),
                },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: 'results.final_published',
                    resource: 'exam-instance',
                    details: { examInstanceId, reason: reason.trim(), withAnswerKey },
                },
            }),
        ]);

        // Milestone 4 of 4 — the score is no longer provisional. Fired after the
        // transaction commits and never allowed to fail the publish: results are
        // published either way, and a partial mail-out is recoverable where a
        // rolled-back publish is confusing to everyone watching for it.
        void this.announceFinalResults(examInstanceId);

        return { examInstanceId, finalResultsReleasedAt: now, answerKeyReleased: withAnswerKey };
    }

    /**
     * Tells every student whose attempt counts that their final report is out.
     *
     * Disqualified attempts are excluded by `SUBMITTED_STATUSES` — a student who
     * has just been disqualified should hear that through the grievance route,
     * not via a cheerful "your result is ready".
     */
    private async announceFinalResults(examInstanceId: string): Promise<void> {
        try {
            const attempts = await this.prisma.attempt.findMany({
                where: { examInstanceId, status: { in: SUBMITTED_STATUSES } },
                select: {
                    user: { select: { email: true, firstName: true } },
                    examInstance: { select: { exam: { select: { title: true } } } },
                },
            });

            for (const attempt of attempts) {
                if (!attempt.user?.email) continue;
                await this.notifications.sendResultsPublished(
                    attempt.user.email,
                    attempt.user.firstName,
                    attempt.examInstance.exam.title,
                );
            }
        } catch (err) {
            this.logger.error(
                `Final-results announcement failed for ${examInstanceId}: ${(err as Error).message}`,
            );
        }
    }

    /**
     * Takes the final report back, returning every score to provisional.
     *
     * Used when a report goes out and turns out to be wrong — the mirror of
     * `revoke`, and the reason `publishFinalReport` is recoverable rather than
     * one-way.
     */
    async revokeFinalReport(examInstanceId: string, adminId: string, reason: string) {
        if (!reason?.trim()) {
            throw new BadRequestException('A reason is required to revoke the final report.');
        }

        const instance = await this.prisma.examInstance.findUnique({ where: { id: examInstanceId } });
        if (!instance) throw new NotFoundException('Exam instance not found');

        await this.prisma.$transaction([
            this.prisma.examInstance.update({
                where: { id: examInstanceId },
                data: {
                    finalResultsReleasedAt: null,
                    answerKeyReleasedAt: null,
                    finalReleasedBy: null,
                },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: 'results.final_revoked',
                    resource: 'exam-instance',
                    details: { examInstanceId, reason: reason.trim() },
                },
            }),
        ]);

        return { examInstanceId, revoked: true };
    }
}
