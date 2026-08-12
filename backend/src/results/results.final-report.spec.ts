import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ResultsService } from './results.service';
import { whatsAppStub } from '../notification/whatsapp.stub';

/**
 * Stage two of the results release: the final report and the answer key.
 *
 * "Unverified score displayed. Final scores, rank, analysis, Answer key in report
 * after the season ends."
 *
 * The behaviour worth pinning is what is *refused*: publishing a final report for
 * an exam still running, for one that was never normalized, or for a cohort that
 * has not even been given a provisional score yet.
 */
describe('ResultsService — final report', () => {
    const INSTANCE = 'inst-1';
    const ADMIN = 'admin-1';

    const HOUR = 60 * 60 * 1000;
    const past = (ms: number) => new Date(Date.now() - ms);
    const future = (ms: number) => new Date(Date.now() + ms);

    /** An exam that finished an hour ago, normalized, provisional scores out. */
    const publishable = {
        id: INSTANCE,
        examId: 'exam-1',
        startsAt: past(3 * HOUR),
        endsAt: past(HOUR),
        resultsNormalizedAt: past(HOUR / 2),
        resultsReleasedToStudentsAt: past(HOUR / 4),
        finalResultsReleasedAt: null,
    };

    function serviceWith(instance: any) {
        const prisma: any = {
            examInstance: {
                findUnique: jest.fn().mockResolvedValue(instance),
                update: jest.fn().mockResolvedValue({}),
            },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
            attempt: {
                count: jest.fn().mockResolvedValue(0),
                // Read by the post-publish announcement.
                findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
        };
        const notifications: any = {
            sendResultsPublished: jest.fn().mockResolvedValue(undefined),
        };
        return { service: new ResultsService(prisma, notifications, whatsAppStub()), prisma, notifications };
    }

    describe('publishFinalReport', () => {
        it('publishes final results and the answer key together by default', async () => {
            const { service, prisma } = serviceWith(publishable);
            const result = await service.publishFinalReport(INSTANCE, ADMIN, 'Season closed.');

            const { data } = prisma.examInstance.update.mock.calls[0][0];
            expect(data.finalResultsReleasedAt).toBeInstanceOf(Date);
            expect(data.answerKeyReleasedAt).toBeInstanceOf(Date);
            expect(data.finalReleasedBy).toBe(ADMIN);
            expect(result.answerKeyReleased).toBe(true);
        });

        it('can hold the answer key back while publishing the scores', async () => {
            // The case: a re-sit still pending for a handful of students, who would
            // otherwise be handed the paper.
            const { service, prisma } = serviceWith(publishable);
            const result = await service.publishFinalReport(INSTANCE, ADMIN, 'Re-sit pending.', false);

            const { data } = prisma.examInstance.update.mock.calls[0][0];
            expect(data.finalResultsReleasedAt).toBeInstanceOf(Date);
            expect(data.answerKeyReleasedAt).toBeUndefined();
            expect(result.answerKeyReleased).toBe(false);
        });

        it('writes an audit log with the stated reason', async () => {
            const { service, prisma } = serviceWith(publishable);
            await service.publishFinalReport(INSTANCE, ADMIN, 'Marking complete.');
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        action: 'results.final_published',
                        userId: ADMIN,
                    }),
                }),
            );
        });

        it('requires a reason', async () => {
            const { service, prisma } = serviceWith(publishable);
            await expect(service.publishFinalReport(INSTANCE, ADMIN, '  ')).rejects.toThrow(
                BadRequestException,
            );
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('refuses while the exam window is still open', async () => {
            const { service } = serviceWith({ ...publishable, endsAt: future(HOUR) });
            await expect(service.publishFinalReport(INSTANCE, ADMIN, 'Too soon.')).rejects.toThrow(
                ConflictException,
            );
        });

        it('refuses when the instance was never normalized', async () => {
            const { service } = serviceWith({ ...publishable, resultsNormalizedAt: null });
            await expect(service.publishFinalReport(INSTANCE, ADMIN, 'No normalize.')).rejects.toThrow(
                ConflictException,
            );
        });

        it('refuses when students never got a provisional score', async () => {
            // Skipping straight to "final" defeats the two-stage design.
            const { service } = serviceWith({ ...publishable, resultsReleasedToStudentsAt: null });
            await expect(
                service.publishFinalReport(INSTANCE, ADMIN, 'Skip provisional.'),
            ).rejects.toThrow(/provisional/i);
        });

        it('refuses to publish twice', async () => {
            const { service } = serviceWith({ ...publishable, finalResultsReleasedAt: past(1000) });
            await expect(service.publishFinalReport(INSTANCE, ADMIN, 'Again.')).rejects.toThrow(
                /already published/i,
            );
        });

        it('404s on an unknown instance', async () => {
            const { service } = serviceWith(null);
            await expect(service.publishFinalReport(INSTANCE, ADMIN, 'x')).rejects.toThrow(
                NotFoundException,
            );
        });

        it('emails only the students whose attempts still count', async () => {
            const { service, prisma, notifications } = serviceWith(publishable);
            prisma.attempt.findMany.mockResolvedValue([
                {
                    user: { email: 'aarav@example.com', firstName: 'Aarav' },
                    examInstance: { exam: { title: 'Grade 8 Olympiad' } },
                },
            ]);

            await service.publishFinalReport(INSTANCE, ADMIN, 'Season closed.');
            // Allow the fire-and-forget announcement to run.
            await new Promise((resolve) => setImmediate(resolve));

            // A disqualified student must not receive "your result is ready" —
            // the query is scoped to SUBMITTED_STATUSES, which omits DISQUALIFIED.
            const where = prisma.attempt.findMany.mock.calls[0][0].where;
            expect(where.status.in).not.toContain('DISQUALIFIED');
            expect(notifications.sendResultsPublished).toHaveBeenCalledWith(
                'aarav@example.com',
                'Aarav',
                'Grade 8 Olympiad',
            );
        });

        it('still publishes when the announcement fails', async () => {
            const { service, prisma, notifications } = serviceWith(publishable);
            prisma.attempt.findMany.mockRejectedValue(new Error('mail service down'));

            // The publish is the business action; a mail outage must not undo it.
            await expect(
                service.publishFinalReport(INSTANCE, ADMIN, 'Season closed.'),
            ).resolves.toMatchObject({ examInstanceId: INSTANCE });
            await new Promise((resolve) => setImmediate(resolve));
            expect(notifications.sendResultsPublished).not.toHaveBeenCalled();
        });
    });

    describe('revokeFinalReport', () => {
        it('clears both the final flag and the answer key', async () => {
            const { service, prisma } = serviceWith({
                ...publishable,
                finalResultsReleasedAt: past(1000),
            });
            await service.revokeFinalReport(INSTANCE, ADMIN, 'Marking error found.');

            const { data } = prisma.examInstance.update.mock.calls[0][0];
            expect(data.finalResultsReleasedAt).toBeNull();
            // Leaving the key published while un-publishing the scores would hand
            // students the paper with the marks still in dispute.
            expect(data.answerKeyReleasedAt).toBeNull();
            expect(data.finalReleasedBy).toBeNull();
        });

        it('requires a reason', async () => {
            const { service } = serviceWith(publishable);
            await expect(service.revokeFinalReport(INSTANCE, ADMIN, '')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('writes an audit log', async () => {
            const { service, prisma } = serviceWith(publishable);
            await service.revokeFinalReport(INSTANCE, ADMIN, 'Wrong key published.');
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ action: 'results.final_revoked' }),
                }),
            );
        });
    });

    describe('getStatus reports the stage-two state', () => {
        it('says the final report can be published once provisional results are out', async () => {
            const { service, prisma } = serviceWith(publishable);
            prisma.examInstance.findUnique.mockResolvedValue({
                ...publishable,
                exam: { id: 'exam-1', title: 'Grade 8', isResultReleased: true },
            });
            prisma.certificate = { count: jest.fn().mockResolvedValue(0) };

            const status = await service.getStatus(INSTANCE);
            expect(status.canPublishFinal).toBe(true);
            expect(status.publishFinalBlockedReason).toBeNull();
        });

        it('explains why it cannot be published yet', async () => {
            const { service, prisma } = serviceWith(publishable);
            prisma.examInstance.findUnique.mockResolvedValue({
                ...publishable,
                resultsReleasedToStudentsAt: null,
                exam: { id: 'exam-1', title: 'Grade 8', isResultReleased: false },
            });
            prisma.certificate = { count: jest.fn().mockResolvedValue(0) };

            const status = await service.getStatus(INSTANCE);
            expect(status.canPublishFinal).toBe(false);
            expect(status.publishFinalBlockedReason).toMatch(/provisional/i);
        });
    });
});
