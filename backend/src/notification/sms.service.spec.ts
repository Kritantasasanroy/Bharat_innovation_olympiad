import { Prisma, SmsStatus } from '@prisma/client';
import { SmsJustProvider } from './sms-just.provider';
import { SmsService } from './sms.service';
import {
    examRequirementsMessage,
    registrationMessage,
    reminderMessage,
    scheduleMessage,
    submissionMessage,
} from './sms-templates';

/**
 * The three properties every caller depends on: **never throws**, **sends at
 * most once**, and **never sends two messages closer together than the queue
 * gap**.
 *
 * All three are load-bearing. A throw here would fail a submit and cost a
 * student their exam over a messaging problem; a lost dedupe would re-message
 * an entire cohort on the next restart; a burst is what gets the sender id
 * throttled by the DLT gateway.
 */

/** The unique-constraint violation Prisma raises when a dedupe row already exists. */
function uniqueViolation() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
    });
}

/** Flushes the instance's serial send queue. */
async function drainQueue(service: SmsService): Promise<void> {
    await (service as any).chain;
}

function serviceWith(
    prismaOverrides: Record<string, unknown> = {},
    provider?: { sendTemplate: jest.Mock },
) {
    const create = jest.fn().mockResolvedValue({ id: 'sms-1' });
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
        smsMessage: { create, update, findMany: jest.fn(), ...prismaOverrides },
    };
    const service = new SmsService(prisma);
    service.onModuleInit();

    const sendTemplate =
        provider?.sendTemplate ?? jest.fn().mockResolvedValue({ ok: true, scheduleId: '5068570-2026_09_15' });
    // The provider is chosen at boot from env; swapping it afterwards is what
    // keeps these tests off the network.
    (service as any).provider = { name: 'test', sendTemplate, balance: jest.fn() };
    (service as any).enabled = true;
    // A small but real gap: long enough to prove the queue waits, short enough
    // that the suite stays fast. The gap logic is identical at 30s.
    (service as any).minGapMs = 40;

    return { service, prisma, create, update, sendTemplate };
}

const STUDENT = {
    userId: 'user-1',
    phone: '+919812345678',
    firstName: 'Akash',
    attemptId: 'attempt-1',
    submittedAt: new Date('2026-08-18T09:30:00.000Z'),
};

describe('SmsService — sending once', () => {
    it('claims the dedupe row before calling the gateway, not after', async () => {
        const { service, create, sendTemplate } = serviceWith();
        await service.sendSubmission(STUDENT);
        await drainQueue(service);

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

        await service.sendSubmission(STUDENT);
        await drainQueue(service);

        expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('marks the row SENT with the gateway submission id', async () => {
        const { service, update } = serviceWith();
        await service.sendSubmission(STUDENT);
        await drainQueue(service);

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'sms-1' },
                data: expect.objectContaining({
                    status: SmsStatus.SENT,
                    providerId: '5068570-2026_09_15',
                }),
            }),
        );
    });

    it('records a gateway rejection as FAILED', async () => {
        const { service, update } = serviceWith(
            {},
            { sendTemplate: jest.fn().mockResolvedValue({ ok: false, error: 'ES1013 Template id is invalid' }) },
        );

        await service.sendSubmission(STUDENT);
        await drainQueue(service);

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: SmsStatus.FAILED }),
            }),
        );
    });

    it('skips without claiming when the student has no phone number', async () => {
        const { service, create, sendTemplate } = serviceWith();

        await service.sendSubmission({ ...STUDENT, phone: null, phoneRaw: null });
        await drainQueue(service);

        expect(create).not.toHaveBeenCalled();
        expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('never calls the provider while the kill switch is on', async () => {
        const { service, create, sendTemplate } = serviceWith();
        (service as any).enabled = false;

        await service.sendSubmission(STUDENT);
        await drainQueue(service);

        expect(create).not.toHaveBeenCalled();
        expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('sends each template under its own DLT id', async () => {
        const { service, sendTemplate } = serviceWith();

        await service.sendRegistration({ ...STUDENT, rollNumber: 'BIO26-G6-00017' });
        await service.sendSchedule({
            userId: STUDENT.userId,
            phone: STUDENT.phone,
            firstName: STUDENT.firstName,
            bookingId: 'b1',
            slotId: 's1',
            startsAt: new Date('2026-09-28T04:00:00.000Z'),
        });
        await service.sendExamRequirements({ userId: STUDENT.userId, phone: STUDENT.phone });
        await drainQueue(service);

        expect(sendTemplate.mock.calls.map((c) => c[1])).toEqual([
            '1777178939340857740', // BIOREGISTRATION
            '1777178938193640968', // BIOSCHEDULE
            '1777178939292597525', // BIOEXAMREQUIREMENTS
        ]);
    });
});

describe('SmsService — the 30s-spaced queue', () => {
    it('serialises concurrent sends and keeps the gap between them', async () => {
        const { service, sendTemplate } = serviceWith();

        // Three sends aligned at the same instant — the backfill shape.
        const start = Date.now();
        await Promise.all([
            service.sendRegistration({ ...STUDENT, rollNumber: 'BIO26-G6-00001' }),
            service.sendRegistration({ userId: 'user-2', phone: STUDENT.phone, rollNumber: 'BIO26-G6-00002' }),
            service.sendRegistration({ userId: 'user-3', phone: STUDENT.phone, rollNumber: 'BIO26-G6-00003' }),
        ]);
        await drainQueue(service);

        expect(sendTemplate).toHaveBeenCalledTimes(3);
        // 3 sends with a 40ms minimum gap: at least 2 gaps must have elapsed.
        expect(Date.now() - start).toBeGreaterThanOrEqual(80);
    });
});

describe('SMS template bodies match the DLT-approved text', () => {
    const at = new Date('2026-09-28T04:00:00.000Z'); // 9:30 AM IST

    it('registration carries the roll number', () => {
        const text = registrationMessage({ rollNumber: 'BIO26-G6-00017' });
        expect(text).toContain(
            'Congratulations ! Your registration with Bharat Innovation Olympiad is confirmed.',
        );
        expect(text).toContain('Your roll number is BIO26-G6-00017.');
        expect(text).toContain('Thanks.');
        expect(text).toContain('Bharat Innovation Olympiad team - Lemon Ideas');
    });

    it('schedule carries the name, ordinal date and unspaced IST time', () => {
        const text = scheduleMessage({ firstName: 'Rahul', startsAt: at });
        expect(text).toContain('Hi Rahul,');
        expect(text).toContain('Your schedule for the Bharat Innovation Olympiad exam is as follows:');
        expect(text).toContain('Date : 28th September 2026');
        expect(text).toContain('Time: 9:30AM IST | Online');
        expect(text).toContain('+918421411142');
    });

    it('requirements is static — no variables at all', () => {
        const text = examRequirementsMessage();
        expect(text).toContain('Windows OS 10+ or macOS 10.14+');
        expect(text).toContain('Peaceful place with solid & plain background');
        expect(text).not.toContain('{#');
    });

    it('reminder names the date and time', () => {
        const text = reminderMessage({ startsAt: at });
        expect(text).toContain('scheduled for - 28th September 2026 at 9:30AM IST.');
        expect(text).toContain('Bharat Olympiad team | Lemon Ideas India');
    });

    it('submission carries the name and submission date', () => {
        const text = submissionMessage({ firstName: 'Rahul', submittedAt: at });
        expect(text).toContain('Hi Rahul,');
        expect(text).toContain(
            'successful exam submission at the Bharat Innovation Olympiad organised by Lemon Ideas on 28th September 2026',
        );
    });
});

describe('SmsJustProvider — response handling', () => {
    it('derives the balance endpoint from the send endpoint', () => {
        const provider = new SmsJustProvider(
            'http://www.smsjust.com/sms/user/urlsms.php',
            'u',
            'p',
            'LEMONN',
            'ent',
        );
        expect((provider as any).balanceEndpoint).toBe(
            'http://www.smsjust.com/sms/user/balance_check.php',
        );
    });
});
