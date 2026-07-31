import { ForbiddenException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { DEMO_EXAM_IDS } from '../common/demo-exams';

/**
 * The parental-consent gate on exam start.
 *
 * Two things are pinned here, and the second matters more than the first:
 *
 *  1. A student with no guardian consent cannot start a proctored attempt —
 *     including the trial and the free practice paper, because those run the
 *     identical webcam-proctored environment on a minor.
 *
 *  2. **The pre-existing gates still fire, in the same order.** Adding a gate to
 *     `startAttempt` is exactly the kind of change that silently shadows another
 *     one: put it in the wrong place and a student with no access pass gets told
 *     to fetch their parent instead of being sent to pay. So each case asserts
 *     the *specific* refusal, not merely that something was refused.
 */
describe('AttemptService — parental consent gate', () => {
    const USER = 'student-1';
    const INSTANCE = 'instance-1';
    const PRACTICE_EXAM_ID = [...DEMO_EXAM_IDS][0];
    const REAL_EXAM_ID = 'exam-real-1';

    function serviceFor(opts: {
        faceEnrolled?: boolean;
        guardianConsent?: boolean;
        hasPass?: boolean;
        examId?: string;
        isTrial?: boolean;
    }) {
        const examId = opts.examId ?? REAL_EXAM_ID;
        const exam = {
            id: examId,
            isTrial: opts.isTrial ?? false,
            requiresTrial: false,
            isPublished: true,
        };

        const prisma: any = {
            user: {
                findUnique: jest.fn().mockResolvedValue({
                    faceEmbedding: opts.faceEnrolled === false ? null : [0.1],
                }),
            },
            examInstance: {
                findUnique: jest.fn().mockResolvedValue({
                    id: INSTANCE,
                    examId,
                    exam,
                    // Wide-open window so the phase check is never what refuses.
                    startsAt: new Date(Date.now() - 3_600_000),
                    endsAt: new Date(Date.now() + 3_600_000),
                }),
            },
            exam: { findFirst: jest.fn().mockResolvedValue(null) },
            trialCompletion: { findUnique: jest.fn().mockResolvedValue({ id: 'tc-1' }) },
            booking: { findFirst: jest.fn().mockResolvedValue(null) },
            attempt: { findUnique: jest.fn().mockResolvedValue(null) },
        };

        const accessPass: any = {
            hasActivePass: jest.fn().mockResolvedValue(opts.hasPass !== false),
        };
        const guardian: any = {
            hasGuardianConsent: jest.fn().mockResolvedValue(opts.guardianConsent !== false),
        };
        const proctor: any = { flagForReviewIfRisky: jest.fn().mockResolvedValue('NOT_REQUIRED') };

        return {
            service: new AttemptService(prisma, accessPass, guardian, proctor),
            prisma,
            accessPass,
            guardian,
        };
    }

    /** The refusal code, whatever else the call went on to do. */
    async function refusalFrom(service: AttemptService): Promise<string | null> {
        return service.startAttempt(USER, INSTANCE).then(
            () => null,
            (err) => err?.message ?? null,
        );
    }

    it('refuses a real exam with GUARDIAN_CONSENT_REQUIRED when consent is missing', async () => {
        const { service } = serviceFor({ guardianConsent: false });
        await expect(service.startAttempt(USER, INSTANCE)).rejects.toThrow(
            new ForbiddenException('GUARDIAN_CONSENT_REQUIRED'),
        );
    });

    it('refuses the free practice paper too — same webcam, same minor', async () => {
        const { service } = serviceFor({ guardianConsent: false, examId: PRACTICE_EXAM_ID });
        expect(await refusalFrom(service)).toBe('GUARDIAN_CONSENT_REQUIRED');
    });

    it('refuses the trial paper too', async () => {
        const { service } = serviceFor({ guardianConsent: false, isTrial: true });
        expect(await refusalFrom(service)).toBe('GUARDIAN_CONSENT_REQUIRED');
    });

    it('lets a consented student past the gate', async () => {
        const { service, guardian } = serviceFor({ guardianConsent: true });
        // It may still fail further down (no booking on a real exam); the point is
        // only that parental consent is not what stopped it.
        expect(await refusalFrom(service)).not.toBe('GUARDIAN_CONSENT_REQUIRED');
        expect(guardian.hasGuardianConsent).toHaveBeenCalledWith(USER);
    });

    describe('precedence — the gate must not shadow the existing ones', () => {
        it('still reports FACE_ENROLLMENT_REQUIRED first, before consent', async () => {
            const { service, guardian } = serviceFor({
                faceEnrolled: false,
                guardianConsent: false,
            });
            expect(await refusalFrom(service)).toBe('FACE_ENROLLMENT_REQUIRED');
            // Face enrollment is checked first, so consent is never consulted —
            // one problem reported at a time, in a fixed order.
            expect(guardian.hasGuardianConsent).not.toHaveBeenCalled();
        });

        it('still reports ACCESS_PASS_REQUIRED for an unpaid but consented student', async () => {
            const { service } = serviceFor({ guardianConsent: true, hasPass: false });
            // The regression this guards against: sending an unpaid student to
            // fetch their parent instead of to the payment page.
            expect(await refusalFrom(service)).toBe('ACCESS_PASS_REQUIRED');
        });

        it('checks consent before the paywall, so an unpaid unconsented student is told about consent', async () => {
            const { service, accessPass } = serviceFor({
                guardianConsent: false,
                hasPass: false,
            });
            expect(await refusalFrom(service)).toBe('GUARDIAN_CONSENT_REQUIRED');
            // Consent is an account-completeness problem the student can fix in a
            // minute; it is deliberately ordered ahead of the commercial gate.
            expect(accessPass.hasActivePass).not.toHaveBeenCalled();
        });
    });
});
