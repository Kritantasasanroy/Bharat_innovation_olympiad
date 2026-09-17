import { AccessPassService, SHARED_LINK_UNLOCK_PAISE } from './access-pass.service';

/**
 * "I've paid, check now" has to be able to detect a ₹1 payment even when the
 * Razorpay webhook (or its relay to this backend) never landed. `reconcileForUser`
 * is that active path: it reads this backend's own `SharedLinkPayment` record and,
 * failing that, asks the peer backend Razorpay actually calls.
 */
describe('AccessPassService.reconcileForUser', () => {
    const USER = {
        id: 'u1',
        email: 'Payer+7@Gmail.com',
        phone: '+919000000000',
        firstName: 'Pay',
    };

    function make(overrides: {
        activePass?: boolean;
        localSharedPayment?: any;
        peer?: { status: number; body?: any };
    }) {
        const prisma: any = {
            user: { findUnique: jest.fn().mockResolvedValue(USER) },
            accessPass: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(overrides.activePass ? { status: 'ACTIVE' } : null),
                upsert: jest.fn().mockResolvedValue({}),
            },
            sharedLinkPayment: {
                findFirst: jest.fn().mockResolvedValue(overrides.localSharedPayment ?? null),
                updateMany: jest.fn().mockResolvedValue({}),
            },
            payment: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 'pay-row-1' }),
            },
            booking: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
        };
        const notifications = {
            sendWelcome: jest.fn().mockResolvedValue(undefined),
        };
        const rollNumbers = { ensureFor: jest.fn().mockResolvedValue('BIO26-G6-00001') };
        const slotAssignment = { assignForNewStudent: jest.fn().mockResolvedValue([]) };

        if (overrides.peer) {
            process.env.SHARED_LINK_CHECK_URL = 'https://peer.example/api/payments/shared-link/check';
            global.fetch = jest.fn().mockResolvedValue({
                ok: overrides.peer.status >= 200 && overrides.peer.status < 300,
                json: async () => overrides.peer!.body ?? {},
            }) as any;
        } else {
            delete process.env.SHARED_LINK_CHECK_URL;
        }

        // Re-require so the module-level SHARED_LINK_CHECK_URL picks up the env.
        jest.resetModules();
        const { AccessPassService: Fresh } = require('./access-pass.service');
        return {
            svc: new Fresh(
                prisma,
                notifications,
                rollNumbers,
                slotAssignment,
                { sendRegistration: jest.fn(), sendExamRequirements: jest.fn() },
            ) as AccessPassService,
            prisma,
            notifications,
        };
    }

    afterEach(() => {
        delete process.env.SHARED_LINK_CHECK_URL;
        jest.restoreAllMocks();
    });

    it('returns "active" and does nothing when the pass is already active', async () => {
        const { svc, prisma } = make({ activePass: true });
        await expect(svc.reconcileForUser('u1')).resolves.toEqual({ status: 'active' });
        expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('grants from a ₹1 SharedLinkPayment already recorded locally', async () => {
        const { svc, prisma, notifications } = make({
            localSharedPayment: {
                razorpayPaymentId: 'pay_ABC',
                razorpayOrderId: 'order_ABC',
                amount: SHARED_LINK_UNLOCK_PAISE,
            },
        });
        await expect(svc.reconcileForUser('u1')).resolves.toEqual({ status: 'granted' });
        expect(prisma.payment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ razorpayPaymentId: 'pay_ABC', userId: 'u1' }),
            }),
        );
        expect(prisma.accessPass.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ status: 'ACTIVE' }),
            }),
        );
        expect(notifications.sendWelcome).toHaveBeenCalled();
    });

    it('grants on the peer backend\'s word when nothing is local', async () => {
        const { svc, prisma } = make({
            peer: {
                status: 200,
                body: { paid: true, paymentId: 'pay_PEER', amount: SHARED_LINK_UNLOCK_PAISE },
            },
        });
        await expect(svc.reconcileForUser('u1')).resolves.toEqual({ status: 'granted' });
        expect(prisma.payment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ razorpayPaymentId: 'pay_PEER' }),
            }),
        );
    });

    it('ignores a peer payment whose amount is not the ₹1 unlock', async () => {
        const { svc, prisma } = make({
            peer: { status: 200, body: { paid: true, paymentId: 'pay_BIG', amount: 79900 } },
        });
        await expect(svc.reconcileForUser('u1')).resolves.toEqual({ status: 'not_found' });
        expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('returns "not_found" when neither local nor peer has the payment', async () => {
        const { svc } = make({ peer: { status: 200, body: { paid: false } } });
        await expect(svc.reconcileForUser('u1')).resolves.toEqual({ status: 'not_found' });
    });
});

describe('AccessPassService.lookupSharedLinkPayment', () => {
    function svcWith(row: any) {
        const prisma: any = {
            sharedLinkPayment: { findFirst: jest.fn().mockResolvedValue(row) },
        };
        return {
            svc: new AccessPassService(prisma, {} as any, {} as any, {} as any, {} as any),
            prisma,
        };
    }

    it('matches on lower-cased email or normalised phone, scoped to the ₹1 amount', async () => {
        const { svc, prisma } = svcWith({
            razorpayPaymentId: 'pay_1',
            razorpayOrderId: 'order_1',
            amount: SHARED_LINK_UNLOCK_PAISE,
        });
        const out = await svc.lookupSharedLinkPayment('Foo+9@Gmail.com', '9000000000');
        expect(out).toEqual({
            paid: true,
            paymentId: 'pay_1',
            orderId: 'order_1',
            amount: SHARED_LINK_UNLOCK_PAISE,
        });
        const where = prisma.sharedLinkPayment.findFirst.mock.calls[0][0].where;
        expect(where.amount).toBe(SHARED_LINK_UNLOCK_PAISE);
        expect(where.OR).toEqual(
            expect.arrayContaining([{ email: 'foo+9@gmail.com' }]),
        );
    });

    it('is a bare negative when nothing identifies the payer', async () => {
        const { svc } = svcWith(null);
        await expect(svc.lookupSharedLinkPayment('', '')).resolves.toEqual({ paid: false });
    });
});
