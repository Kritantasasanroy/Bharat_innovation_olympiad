import { BadRequestException } from '@nestjs/common';
import { AttemptService } from './attempt.service';

/**
 * A paper must close on time even when the browser is gone.
 *
 * ## The loophole these cover
 *
 * Every mechanism that ended an exam used to live in the client: the countdown,
 * the pause auto-submit and the violation auto-submit are React state in the
 * player, and `TimerService` only ticks while that page holds a WebSocket open.
 * All of them die the moment the player unmounts.
 *
 * So: start the exam, leave fullscreen, press Back before the 20-second pause
 * elapses, and the attempt is left `IN_PROGRESS` with nothing running that could
 * ever close it. Come back an hour later — or the next day, as many times as you
 * like — and `startAttempt` happily resumed it while `saveAnswer` went on
 * accepting answers, because it checked only that the attempt was *active* and
 * never what the time was. One paper, unlimited sittings, unproctored.
 *
 * The fix is that the deadline is derived server-side from `startedAt`, which a
 * resume never moves, and is enforced on every route that can touch a live
 * attempt. These tests are written against that boundary.
 */

describe('attempt expiry', () => {
    const startedAt = new Date('2026-08-02T09:00:00Z');
    /** A 60-minute paper started at 09:00 — nominally over at 10:00. */
    const attempt = (overrides: Record<string, unknown> = {}) => ({
        id: 'attempt-1',
        userId: 'student-1',
        status: 'IN_PROGRESS',
        startedAt,
        examInstance: { quitUrl: null, exam: { durationMinutes: 60, totalMarks: 50 } },
        items: [],
        ...overrides,
    });

    /**
     * Only what these tests touch. `autoSubmit` is spied on rather than run: what
     * matters here is *whether the paper is closed*, and the scoring it does is
     * covered by the submit tests.
     */
    const serviceWith = (row: ReturnType<typeof attempt>, now: string) => {
        jest.useFakeTimers().setSystemTime(new Date(now));

        const updated = { ...row, status: 'AUTO_SUBMITTED' };
        const prisma = {
            attempt: {
                findUnique: jest.fn().mockResolvedValue(row),
                findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
                update: jest.fn().mockResolvedValue(updated),
            },
            attemptItem: { upsert: jest.fn().mockResolvedValue({}) },
        };

        const service = new AttemptService(prisma as any, {} as any, {} as any, {} as any);
        const autoSubmit = jest
            .spyOn(service, 'autoSubmit')
            .mockImplementation(async () => undefined as never);

        return { service, prisma, autoSubmit };
    };

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('saveAnswer', () => {
        it('accepts an answer while the paper is still open', async () => {
            const { service, prisma, autoSubmit } = serviceWith(attempt(), '2026-08-02T09:30:00Z');

            await service.saveAnswer('attempt-1', 'student-1', 'q1', 'A');

            expect(autoSubmit).not.toHaveBeenCalled();
            expect(prisma.attemptItem.upsert).toHaveBeenCalled();
        });

        it('refuses an answer after the deadline, and closes the paper', async () => {
            // An hour past the end — the shape of "left the player, came back later".
            const { service, prisma, autoSubmit } = serviceWith(attempt(), '2026-08-02T11:00:00Z');

            await expect(service.saveAnswer('attempt-1', 'student-1', 'q1', 'A')).rejects.toThrow(
                BadRequestException,
            );

            expect(autoSubmit).toHaveBeenCalledWith('attempt-1');
            // The whole point: nothing was written after time was up.
            expect(prisma.attemptItem.upsert).not.toHaveBeenCalled();
        });

        it('still accepts a save that lands inside the grace window', async () => {
            // A save already in flight when the clock ran out, on a school
            // connection. Losing a genuine last answer to a 200ms overrun would
            // be a worse bug than the one being fixed.
            const { service, autoSubmit } = serviceWith(attempt(), '2026-08-02T10:00:20Z');

            await service.saveAnswer('attempt-1', 'student-1', 'q1', 'A');

            expect(autoSubmit).not.toHaveBeenCalled();
        });
    });

    describe('submitAttempt', () => {
        it('closes an overdue paper rather than refusing the submit', async () => {
            // Refusing would leave a student pressing Submit against an error on
            // an attempt that is already over. It scores the same saved answers
            // either way, so it is ended and reported as done.
            const { service, autoSubmit } = serviceWith(attempt(), '2026-08-02T11:00:00Z');

            const result = await service.submitAttempt('attempt-1', 'student-1');

            expect(autoSubmit).toHaveBeenCalledWith('attempt-1');
            expect(result.status).toBe('AUTO_SUBMITTED');
        });
    });

    describe('the deadline itself', () => {
        it('is measured from startedAt, which a resume never moves', async () => {
            // Re-entering does not restart the clock. If it did, leaving and
            // coming back would be a free extension — which is the loophole.
            const late = serviceWith(attempt(), '2026-08-02T10:30:00Z');
            await expect(
                late.service.saveAnswer('attempt-1', 'student-1', 'q1', 'A'),
            ).rejects.toThrow(BadRequestException);

            jest.useRealTimers();

            // Same attempt, a longer paper: still open at the same wall-clock time.
            const roomy = serviceWith(
                attempt({ examInstance: { quitUrl: null, exam: { durationMinutes: 180, totalMarks: 50 } } }),
                '2026-08-02T10:30:00Z',
            );
            await roomy.service.saveAnswer('attempt-1', 'student-1', 'q1', 'A');
            expect(roomy.autoSubmit).not.toHaveBeenCalled();
        });

        it('leaves an already-finished attempt alone', async () => {
            const { service, autoSubmit } = serviceWith(
                attempt({ status: 'SUBMITTED' }),
                '2026-08-02T11:00:00Z',
            );

            await expect(service.saveAnswer('attempt-1', 'student-1', 'q1', 'A')).rejects.toThrow(
                /not active/i,
            );
            // Nothing to close — it must not be re-submitted and re-flagged.
            expect(autoSubmit).not.toHaveBeenCalled();
        });

        it('does nothing for an attempt that was never started', async () => {
            const { service, autoSubmit } = serviceWith(
                attempt({ status: 'IN_PROGRESS', startedAt: null }),
                '2026-08-02T11:00:00Z',
            );

            await service.saveAnswer('attempt-1', 'student-1', 'q1', 'A');

            expect(autoSubmit).not.toHaveBeenCalled();
        });
    });
});
