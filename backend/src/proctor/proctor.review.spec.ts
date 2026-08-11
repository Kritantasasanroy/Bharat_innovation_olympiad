import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttemptStatus, ReviewStatus } from '@prisma/client';
import { ProctorService, REVIEW_RISK_THRESHOLD } from './proctor.service';
import { SUBMITTED_STATUSES } from '../results/results.service';

/**
 * Post-exam human review, and the disqualification it can lead to.
 *
 * The rule that matters most is the last block: a disqualified attempt must fall
 * out of normalization, ranking, certificates and the school/partner exports. That
 * happens by *omission* — `SUBMITTED_STATUSES` does not list `DISQUALIFIED` — which
 * is efficient but silent, so it is pinned here explicitly. If someone ever adds
 * `DISQUALIFIED` to that list, this suite fails rather than a disqualified student
 * quietly reappearing in the rankings.
 */
describe('ProctorService — post-exam review', () => {
    const ATTEMPT = 'attempt-1';
    const ADMIN = 'admin-1';

    function serviceWith(overrides: any = {}) {
        const prisma: any = {
            attempt: {
                findUnique: jest.fn().mockResolvedValue(overrides.attempt ?? null),
                findMany: jest.fn().mockResolvedValue(overrides.attempts ?? []),
                update: jest.fn().mockImplementation(({ data }: any) =>
                    Promise.resolve({ id: ATTEMPT, ...data }),
                ),
            },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
            $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
        };
        // Object storage is only reached by `createEvent` when a violation
        // carries a snapshot; nothing in the review flow uploads anything, so a
        // stub that would throw if called is the honest double here.
        const storage: any = {
            uploadImageBuffer: jest.fn().mockRejectedValue(
                new Error('review flow must not upload'),
            ),
        };
        return { service: new ProctorService(prisma, storage), prisma, storage };
    }

    describe('flagForReviewIfRisky', () => {
        it('queues an attempt at or above the threshold', async () => {
            const { service, prisma } = serviceWith({
                attempt: { riskScore: REVIEW_RISK_THRESHOLD, reviewStatus: ReviewStatus.NOT_REQUIRED },
            });
            await expect(service.flagForReviewIfRisky(ATTEMPT)).resolves.toBe(ReviewStatus.PENDING);
            expect(prisma.attempt.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { reviewStatus: ReviewStatus.PENDING } }),
            );
        });

        it('leaves a low-risk attempt alone', async () => {
            const { service, prisma } = serviceWith({
                attempt: { riskScore: 0.1, reviewStatus: ReviewStatus.NOT_REQUIRED },
            });
            await expect(service.flagForReviewIfRisky(ATTEMPT)).resolves.toBe(ReviewStatus.NOT_REQUIRED);
            expect(prisma.attempt.update).not.toHaveBeenCalled();
        });

        it('never re-queues an attempt a reviewer has already cleared', async () => {
            const { service, prisma } = serviceWith({
                attempt: { riskScore: 0.9, reviewStatus: ReviewStatus.CLEARED },
            });
            // A re-score must not drag a settled verdict back into the queue.
            await expect(service.flagForReviewIfRisky(ATTEMPT)).resolves.toBe(ReviewStatus.CLEARED);
            expect(prisma.attempt.update).not.toHaveBeenCalled();
        });

        it('tolerates a missing attempt rather than throwing into a submit', async () => {
            const { service } = serviceWith({ attempt: null });
            await expect(service.flagForReviewIfRisky(ATTEMPT)).resolves.toBe(ReviewStatus.NOT_REQUIRED);
        });
    });

    describe('listReviewQueue', () => {
        it('asks for finished attempts only, worst risk first', async () => {
            const { service, prisma } = serviceWith();
            await service.listReviewQueue();

            const args = prisma.attempt.findMany.mock.calls[0][0];
            expect(args.orderBy).toEqual([{ riskScore: 'desc' }, { submittedAt: 'asc' }]);
            // An in-progress attempt has a risk score that is still moving and
            // nothing to review yet.
            expect(args.where.status.in).not.toContain(AttemptStatus.IN_PROGRESS);
            expect(args.where.status.in).toEqual(
                expect.arrayContaining([
                    AttemptStatus.SUBMITTED,
                    AttemptStatus.AUTO_SUBMITTED,
                    AttemptStatus.DISQUALIFIED,
                ]),
            );
        });

        it('excludes attempts that were never flagged', async () => {
            const { service, prisma } = serviceWith();
            await service.listReviewQueue();
            expect(prisma.attempt.findMany.mock.calls[0][0].where.reviewStatus).toEqual({
                not: ReviewStatus.NOT_REQUIRED,
            });
        });

        it('can be narrowed to one exam instance', async () => {
            const { service, prisma } = serviceWith();
            await service.listReviewQueue({ examInstanceId: 'inst-1' });
            expect(prisma.attempt.findMany.mock.calls[0][0].where.examInstanceId).toBe('inst-1');
        });
    });

    describe('recordReview', () => {
        const open = {
            id: ATTEMPT,
            status: AttemptStatus.SUBMITTED,
            examInstance: { finalResultsReleasedAt: null },
        };

        it.each([['CLEARED'], ['DISQUALIFIED']] as const)(
            'refuses a %s verdict with no written reason',
            async (verdict) => {
                const { service, prisma } = serviceWith({ attempt: open });
                await expect(service.recordReview(ATTEMPT, ADMIN, verdict, '   ')).rejects.toThrow(
                    BadRequestException,
                );
                expect(prisma.$transaction).not.toHaveBeenCalled();
            },
        );

        it('disqualifying sets AttemptStatus.DISQUALIFIED', async () => {
            const { service, prisma } = serviceWith({ attempt: open });
            await service.recordReview(ATTEMPT, ADMIN, 'DISQUALIFIED', 'Two faces for 6 minutes.');

            const { data } = prisma.attempt.update.mock.calls[0][0];
            expect(data.status).toBe(AttemptStatus.DISQUALIFIED);
            expect(data.reviewStatus).toBe(ReviewStatus.DISQUALIFIED);
            expect(data.reviewNotes).toBe('Two faces for 6 minutes.');
            expect(data.reviewedBy).toBe(ADMIN);
        });

        it('clearing records the verdict but leaves the attempt scored', async () => {
            const { service, prisma } = serviceWith({ attempt: open });
            await service.recordReview(ATTEMPT, ADMIN, 'CLEARED', 'Sibling walked past once.');

            const { data } = prisma.attempt.update.mock.calls[0][0];
            expect(data.reviewStatus).toBe(ReviewStatus.CLEARED);
            // Crucially NOT touched — a cleared student keeps their result.
            expect(data.status).toBeUndefined();
        });

        it('always writes an audit log', async () => {
            const { service, prisma } = serviceWith({ attempt: open });
            await service.recordReview(ATTEMPT, ADMIN, 'DISQUALIFIED', 'Evidence attached.');
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        userId: ADMIN,
                        action: 'proctor.review.disqualified',
                        resource: 'attempt',
                    }),
                }),
            );
        });

        it('refuses to change a verdict after the final report is published', async () => {
            const { service } = serviceWith({
                attempt: { ...open, examInstance: { finalResultsReleasedAt: new Date() } },
            });
            // Otherwise every published rank below this student silently shifts.
            await expect(
                service.recordReview(ATTEMPT, ADMIN, 'DISQUALIFIED', 'Late evidence.'),
            ).rejects.toThrow(ConflictException);
        });

        it('404s on an unknown attempt', async () => {
            const { service } = serviceWith({ attempt: null });
            await expect(service.recordReview(ATTEMPT, ADMIN, 'CLEARED', 'ok')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    /**
     * The exclusion guarantee. This is the part that must never regress.
     */
    describe('a disqualified attempt is excluded everywhere that matters', () => {
        it('is absent from SUBMITTED_STATUSES', () => {
            expect(SUBMITTED_STATUSES).not.toContain(AttemptStatus.DISQUALIFIED);
        });

        it('SUBMITTED_STATUSES still contains exactly the two submitted states', () => {
            // Guards the other direction too: quietly dropping AUTO_SUBMITTED would
            // erase every auto-submitted student from the rankings.
            expect([...SUBMITTED_STATUSES].sort()).toEqual(
                [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED].sort(),
            );
        });

        it('DISQUALIFIED is a real status distinct from the submitted ones', () => {
            expect(AttemptStatus.DISQUALIFIED).toBeDefined();
            expect(AttemptStatus.DISQUALIFIED).not.toBe(AttemptStatus.SUBMITTED);
            expect(AttemptStatus.DISQUALIFIED).not.toBe(AttemptStatus.AUTO_SUBMITTED);
        });
    });
});
