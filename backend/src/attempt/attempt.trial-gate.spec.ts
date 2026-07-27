import { ForbiddenException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { DEMO_EXAM_IDS } from '../common/demo-exams';

/**
 * The rehearsal gate: a student sits the trial paper before *any* real paper,
 * practice papers included.
 *
 * The paywall and the slot window are both waived for practice exams, and the
 * rehearsal gate originally rode along on that same `demo` flag. That was
 * wrong — a practice exam is exactly where a first-timer meets fullscreen and
 * webcam proctoring, so it is the one they most need the warm-up for. This
 * pins the gate as deliberately *not* sharing the demo exemption.
 *
 * `getTrialStatus` is the advisory read the instructions page uses to route the
 * student to the trial instead of letting them fail at the start gate, so the
 * two must agree: if the UI says "not needed" while the server says
 * TRIAL_REQUIRED, the student is stranded on a Start button that refuses.
 */
describe('AttemptService — rehearsal gate covers practice exams', () => {
    const PRACTICE_EXAM_ID = [...DEMO_EXAM_IDS][0];
    const USER = 'student-1';
    const INSTANCE = 'instance-1';

    function serviceFor(
        exam: { id: string; isTrial: boolean; requiresTrial: boolean },
        opts: { trialSat?: boolean; trialExamExists?: boolean } = {},
    ) {
        const prisma: any = {
            examInstance: {
                findUnique: jest.fn().mockResolvedValue({ id: INSTANCE, examId: exam.id, exam }),
            },
            exam: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue(opts.trialExamExists === false ? null : { id: 'trial-1' }),
            },
            trialCompletion: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(opts.trialSat ? { id: 'tc-1', completedAt: new Date() } : null),
            },
        };
        return new AttemptService(prisma, {} as any);
    }

    it('reports the trial as required for a practice exam', async () => {
        const service = serviceFor({
            id: PRACTICE_EXAM_ID,
            isTrial: false,
            requiresTrial: true,
        });

        await expect(service.getTrialStatus(USER, INSTANCE)).resolves.toMatchObject({
            required: true,
            completed: false,
        });
    });

    it('reports it satisfied once the practice exam student has sat it', async () => {
        const service = serviceFor(
            { id: PRACTICE_EXAM_ID, isTrial: false, requiresTrial: true },
            { trialSat: true },
        );

        await expect(service.getTrialStatus(USER, INSTANCE)).resolves.toMatchObject({
            required: true,
            completed: true,
        });
    });

    it('exempts the trial paper itself, so it can never gate on itself', async () => {
        const service = serviceFor({ id: 'trial-1', isTrial: true, requiresTrial: false });

        await expect(service.getTrialStatus(USER, INSTANCE)).resolves.toMatchObject({
            required: false,
        });
    });

    it('honours an admin turning the gate off for one exam', async () => {
        const service = serviceFor({ id: 'exam-9', isTrial: false, requiresTrial: false });

        await expect(service.getTrialStatus(USER, INSTANCE)).resolves.toMatchObject({
            required: false,
        });
    });

    /**
     * `requiresTrial` defaults to true, so every exam acquires the gate the
     * moment the column exists. If no trial paper is configured the gate must
     * disengage — otherwise a deploy landing before the trial is created makes
     * every exam on the platform unstartable, with no fix available from inside
     * the product.
     */
    it('startAttempt lets a practice exam through when no trial paper exists', async () => {
        const service = serviceFor(
            { id: PRACTICE_EXAM_ID, isTrial: false, requiresTrial: true },
            { trialExamExists: false },
        );
        (service as any).prisma.user = {
            findUnique: jest.fn().mockResolvedValue({ faceEmbedding: [0.1] }),
        };

        // It gets past the rehearsal gate and fails later, on the phase check —
        // the point is only that the refusal is not TRIAL_REQUIRED.
        const err = await service.startAttempt(USER, INSTANCE).then(
            () => null,
            (e) => e,
        );
        expect(err?.message).not.toBe('TRIAL_REQUIRED');
        expect((service as any).prisma.trialCompletion.findUnique).not.toHaveBeenCalled();
    });

    it('startAttempt refuses a practice exam with TRIAL_REQUIRED when the trial is unsat', async () => {
        const service = serviceFor({
            id: PRACTICE_EXAM_ID,
            isTrial: false,
            requiresTrial: true,
        });
        (service as any).prisma.user = {
            findUnique: jest.fn().mockResolvedValue({ faceEmbedding: [0.1] }),
        };

        await expect(service.startAttempt(USER, INSTANCE)).rejects.toThrow(
            new ForbiddenException('TRIAL_REQUIRED'),
        );
    });
});
