import { Prisma, WhatsAppStatus } from '@prisma/client';
import { tomorrowInIst } from './whatsapp-reminder.service';
import { toWatiNumber } from './whatsapp.provider';
import { WhatsAppService } from './whatsapp.service';

/**
 * The two properties every caller depends on: **never throws**, and **sends at
 * most once**.
 *
 * Both are load-bearing. A throw here would fail a submit and cost a student
 * their exam over a messaging problem, and a lost dedupe would re-message an
 * entire cohort on the next restart — which is a support incident and the
 * fastest route to having the number rate-limited by Meta.
 */

/** The unique-constraint violation Prisma raises when a dedupe row already exists. */
function uniqueViolation() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
    });
}

function serviceWith(
    prismaOverrides: Record<string, unknown> = {},
    provider?: { sendTemplate: jest.Mock },
) {
    const create = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
        whatsAppMessage: { create, update, findMany: jest.fn(), ...prismaOverrides },
    };
    const service = new WhatsAppService(prisma);
    service.onModuleInit();

    const sendTemplate =
        provider?.sendTemplate ?? jest.fn().mockResolvedValue({ ok: true, messageId: 'wamid.1' });
    // The provider is chosen at boot from env; swapping it afterwards is what
    // keeps these tests off the network.
    (service as any).provider = { name: 'test', sendTemplate, diagnostics: jest.fn() };
    (service as any).enabled = true;

    return { service, prisma, create, update, sendTemplate };
}

const STUDENT = {
    userId: 'user-1',
    phone: '+919812345678',
    firstName: 'Akash',
    attemptId: 'attempt-1',
    submittedAt: new Date('2026-08-18T09:30:00.000Z'),
};

describe('WhatsAppService — sending once', () => {
    it('claims the dedupe row before calling the provider, not after', async () => {
        const { service, create, sendTemplate } = serviceWith();
        await service.sendSubmission(STUDENT);

        // Order matters: send-then-record leaves a window where a crash
        // re-messages the student on the next run.
        expect(create).toHaveBeenCalled();
        expect(sendTemplate).toHaveBeenCalled();
        expect(create.mock.invocationCallOrder[0]).toBeLessThan(
            sendTemplate.mock.invocationCallOrder[0],
        );
    });

    it('does not send when the dedupe row already exists', async () => {
        const { service, sendTemplate } = serviceWith({
            create: jest.fn().mockRejectedValue(uniqueViolation()),
        });

        const outcome = await service.sendSubmission(STUDENT);

        expect(outcome).toEqual({ sent: false, skipped: 'already-sent' });
        expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('marks the row SENT with the provider’s message id', async () => {
        const { service, update } = serviceWith();
        await service.sendSubmission(STUDENT);

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'msg-1' },
                data: expect.objectContaining({
                    status: WhatsAppStatus.SENT,
                    providerId: 'wamid.1',
                }),
            }),
        );
    });

    it('records a provider rejection as FAILED and reports it', async () => {
        const { service, update } = serviceWith(
            {},
            { sendTemplate: jest.fn().mockResolvedValue({ ok: false, error: 'not opted in' }) },
        );

        const outcome = await service.sendSubmission(STUDENT);

        expect(outcome).toEqual({ sent: false, error: 'not opted in' });
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: WhatsAppStatus.FAILED }),
            }),
        );
    });
});

describe('WhatsAppService — never throwing', () => {
    it('reports rather than throws when the database is unreachable', async () => {
        const { service, sendTemplate } = serviceWith({
            create: jest.fn().mockRejectedValue(new Error('connection refused')),
        });

        await expect(service.sendSubmission(STUDENT)).resolves.toEqual({
            sent: false,
            error: 'connection refused',
        });
        expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('still reports success when only the bookkeeping update fails', async () => {
        // The message went out. Losing the log row must not make the caller
        // believe it did not.
        const { service } = serviceWith({
            update: jest.fn().mockRejectedValue(new Error('write conflict')),
        });

        await expect(service.sendSubmission(STUDENT)).resolves.toEqual({ sent: true });
    });

    it.each([[null], [undefined], ['']])(
        'skips a student with no phone number (%s) without touching the database',
        async (phone) => {
            const { service, create } = serviceWith();
            const outcome = await service.sendSubmission({ ...STUDENT, phone: phone as any });

            expect(outcome).toEqual({ sent: false, skipped: 'no-phone' });
            expect(create).not.toHaveBeenCalled();
        },
    );

    it('sends nothing at all when WHATSAPP_ENABLED is false', async () => {
        const { service, create, sendTemplate } = serviceWith();
        (service as any).enabled = false;

        await expect(service.sendSubmission(STUDENT)).resolves.toEqual({
            sent: false,
            skipped: 'disabled',
        });
        expect(create).not.toHaveBeenCalled();
        expect(sendTemplate).not.toHaveBeenCalled();
    });
});

describe('WhatsAppService — what "once" means per template', () => {
    const keyOf = (create: jest.Mock) => create.mock.calls[0][0].data.dedupeKey;

    it('keys a submission on the attempt', async () => {
        const { service, create } = serviceWith();
        await service.sendSubmission(STUDENT);
        expect(keyOf(create)).toBe('attempt-1');
    });

    it('keys a schedule on booking AND slot, so a reassigned student is told again', async () => {
        const { service, create } = serviceWith();
        await service.sendSchedule({
            userId: 'user-1',
            phone: '+919812345678',
            firstName: 'Rajesh',
            bookingId: 'booking-1',
            slotId: 'slot-2',
            startsAt: new Date('2026-08-18T09:30:00.000Z'),
        });
        // Keying on the booking alone would suppress the message that tells a
        // moved student their exam is now on a different day.
        expect(keyOf(create)).toBe('booking-1:slot-2');
    });

    it('keys a reminder on booking AND exam date, so a moved exam is reminded again', async () => {
        const { service, create } = serviceWith();
        await service.sendReminder({
            userId: 'user-1',
            phone: '+919812345678',
            firstName: 'Rajesh',
            bookingId: 'booking-1',
            startsAt: new Date('2026-06-20T09:30:00.000Z'),
            examDateKey: '2026-06-20',
        });
        expect(keyOf(create)).toBe('booking-1:2026-06-20');
    });
});

describe('toWatiNumber', () => {
    it('strips the E.164 plus, which WATI does not accept', () => {
        expect(toWatiNumber('+919812345678')).toBe('919812345678');
    });

    it('strips separators a hand-entered number may carry', () => {
        expect(toWatiNumber('+91 98123-45678')).toBe('919812345678');
    });

    it('returns empty for junk rather than sending to a malformed number', () => {
        expect(toWatiNumber('')).toBe('');
        expect(toWatiNumber(undefined as unknown as string)).toBe('');
    });
});

describe('tomorrowInIst', () => {
    // The reminder body says "tomorrow", so this boundary is the difference
    // between a correct reminder and one sent a day early or a day late.
    it('spans tomorrow’s IST calendar day', () => {
        // 2026-08-13 06:00 UTC = 11:30 IST. Tomorrow IST is the 14th, which
        // begins at 18:30 UTC on the 13th.
        const { start, end, dateKey } = tomorrowInIst(new Date('2026-08-13T06:00:00.000Z'));

        expect(start.toISOString()).toBe('2026-08-13T18:30:00.000Z');
        expect(end.toISOString()).toBe('2026-08-14T18:30:00.000Z');
        expect(dateKey).toBe('2026-08-14');
    });

    it('has already rolled over for a UTC time that is tomorrow in India', () => {
        // 20:00 UTC on the 13th is 01:30 IST on the 14th, so "tomorrow" is the
        // 15th. A UTC-based boundary would say the 14th and remind everyone on
        // the wrong day.
        const { dateKey } = tomorrowInIst(new Date('2026-08-13T20:00:00.000Z'));
        expect(dateKey).toBe('2026-08-15');
    });

    it('crosses a month boundary correctly', () => {
        const { dateKey } = tomorrowInIst(new Date('2026-08-31T06:00:00.000Z'));
        expect(dateKey).toBe('2026-09-01');
    });
});
