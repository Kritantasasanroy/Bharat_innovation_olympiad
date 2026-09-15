/**
 * A roll number, a sitting, and the welcome mail that carries both used to
 * fire at registration — before a rupee had changed hands. They now fire once,
 * at the moment a student's access pass first goes ACTIVE, from whichever
 * path caused that: an admin's manual grant here, `activate()` (the browser
 * callback / order-matched webhook) elsewhere. This proves the "once, on the
 * real first transition" contract, since that is the one guarantee every
 * grant path has to keep independently.
 */
import { AccessPassService } from './access-pass.service';

const USER = { id: 'u1', email: 'ada@example.com', firstName: 'Ada', classBand: 6 };

function make(existingStatus: 'ACTIVE' | null) {
    const prisma: any = {
        user: { findUnique: jest.fn().mockResolvedValue(USER) },
        accessPass: {
            findUnique: jest
                .fn()
                .mockResolvedValue(existingStatus ? { status: existingStatus } : null),
            upsert: jest.fn().mockResolvedValue({ id: 'pass-1' }),
            update: jest.fn().mockResolvedValue({ id: 'pass-1' }),
        },
        payment: {
            update: jest.fn().mockResolvedValue({ id: 'pay-1' }),
        },
        $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    const notifications = {
        sendAccessPassActivated: jest.fn().mockResolvedValue(undefined),
        sendWelcome: jest.fn().mockResolvedValue(undefined),
    };
    const rollNumbers = { ensureFor: jest.fn().mockResolvedValue('BIO26-G6-00001') };
    const slotAssignment = { assignForNewStudent: jest.fn().mockResolvedValue([]) };
    const sms = {
        sendRegistration: jest.fn().mockResolvedValue({ sent: false, skipped: 'disabled' }),
        sendExamRequirements: jest.fn().mockResolvedValue({ sent: false, skipped: 'disabled' }),
    };

    const svc = new AccessPassService(
        prisma,
        notifications as any,
        rollNumbers as any,
        slotAssignment as any,
        sms as any,
    );
    return { svc, prisma, notifications, rollNumbers, slotAssignment, sms };
}

describe('registration milestones fire on first activation, not on account creation', () => {
    it('adminGrant on a fresh account issues a roll number, books a sitting, and welcomes the student', async () => {
        const { svc, rollNumbers, slotAssignment, notifications } = make(null);

        await svc.adminGrant('u1');

        expect(rollNumbers.ensureFor).toHaveBeenCalledWith('u1', 6);
        expect(slotAssignment.assignForNewStudent).toHaveBeenCalledWith('u1');
        expect(notifications.sendWelcome).toHaveBeenCalledWith('ada@example.com', 'Ada', 'BIO26-G6-00001');
    });

    it('adminGrant on an already-ACTIVE pass does not re-issue anything', async () => {
        const { svc, rollNumbers, slotAssignment, notifications } = make('ACTIVE');

        await svc.adminGrant('u1');

        expect(rollNumbers.ensureFor).not.toHaveBeenCalled();
        expect(slotAssignment.assignForNewStudent).not.toHaveBeenCalled();
        expect(notifications.sendWelcome).not.toHaveBeenCalled();
    });

    it('activate() on a fresh payment issues the same milestones', async () => {
        const { svc, prisma, rollNumbers, slotAssignment, notifications } = make(null);
        prisma.accessPass.findUnique = jest
            .fn()
            .mockResolvedValueOnce(null) // the "before" read
            .mockResolvedValueOnce({
                user: { id: 'u1', email: 'ada@example.com', firstName: 'Ada' },
                amount: 100,
            }); // the post-write read that keys the notification

        await svc.activate('pay-1', 'pay_real', 'sig');

        expect(rollNumbers.ensureFor).toHaveBeenCalledWith('u1', 6);
        expect(slotAssignment.assignForNewStudent).toHaveBeenCalledWith('u1');
        expect(notifications.sendWelcome).toHaveBeenCalledWith('ada@example.com', 'Ada', 'BIO26-G6-00001');
    });

    it('activate() confirming an already-ACTIVE pass a second time re-issues nothing', async () => {
        const { svc, prisma, rollNumbers, slotAssignment, notifications } = make('ACTIVE');
        prisma.accessPass.findUnique = jest.fn().mockResolvedValue({ status: 'ACTIVE' });

        await svc.activate('pay-1', 'pay_real', 'sig');

        expect(rollNumbers.ensureFor).not.toHaveBeenCalled();
        expect(slotAssignment.assignForNewStudent).not.toHaveBeenCalled();
        expect(notifications.sendWelcome).not.toHaveBeenCalled();
    });

    it('a slot-assignment failure does not stop the roll number or the welcome mail', async () => {
        const { svc, slotAssignment, rollNumbers, notifications } = make(null);
        slotAssignment.assignForNewStudent.mockRejectedValueOnce(new Error('every Sunday is full'));

        await svc.adminGrant('u1');

        expect(rollNumbers.ensureFor).toHaveBeenCalled();
        expect(notifications.sendWelcome).toHaveBeenCalled();
    });
});
