import { SmsOutcome } from './sms.service';

/**
 * A no-op `SmsService` for unit tests.
 *
 * Every send is best-effort and cannot fail the business action that triggered
 * it, so the specs for booking, submission and milestones have nothing to
 * assert about SMS — they only need the dependency to exist and stay quiet.
 * Mirrors `whatsapp.stub.ts` for the same reason.
 */
export function smsStub(): any {
    const skipped: SmsOutcome = { sent: false, skipped: 'disabled' };
    return {
        isLive: false,
        sendRegistration: jest.fn().mockResolvedValue(skipped),
        sendSchedule: jest.fn().mockResolvedValue(skipped),
        sendExamRequirements: jest.fn().mockResolvedValue(skipped),
        sendReminder: jest.fn().mockResolvedValue(skipped),
        sendSubmission: jest.fn().mockResolvedValue(skipped),
        probe: jest.fn().mockResolvedValue(skipped),
        diagnostics: jest.fn().mockResolvedValue({ provider: 'stub', configured: false }),
        recent: jest.fn().mockResolvedValue([]),
    };
}
