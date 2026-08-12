import { WhatsAppOutcome } from './whatsapp.service';

/**
 * A no-op `WhatsAppService` for unit tests.
 *
 * Every send is best-effort and cannot fail the business action that triggered
 * it, so the specs for booking, submission and results have nothing to assert
 * about WhatsApp — they only need the dependency to exist and stay quiet. A
 * shared stub keeps that from being eight slightly different inline objects
 * that each have to be updated when a method is added.
 *
 * `whatsapp.templates.spec.ts` and `whatsapp.service.spec.ts` cover the real
 * behaviour; this is deliberately inert.
 */
export function whatsAppStub(): any {
    const skipped: WhatsAppOutcome = { sent: false, skipped: 'disabled' };
    return {
        isLive: false,
        sendSubmission: jest.fn().mockResolvedValue(skipped),
        sendSchedule: jest.fn().mockResolvedValue(skipped),
        sendResult: jest.fn().mockResolvedValue(skipped),
        sendReminder: jest.fn().mockResolvedValue(skipped),
        probe: jest.fn().mockResolvedValue(skipped),
        diagnostics: jest.fn().mockResolvedValue({ provider: 'stub', configured: false }),
        recent: jest.fn().mockResolvedValue([]),
    };
}
