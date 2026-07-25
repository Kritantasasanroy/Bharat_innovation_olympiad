import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { AccessPassStatus, PaymentStatus } from '@prisma/client';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { isDemoExam } from '../common/demo-exams';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../auth/phone.helpers';

/**
 * The one-off platform fee, in paise. A student pays this once and can then sit
 * every exam, so it is deliberately account-level rather than per-slot.
 */
export const ACCESS_PASS_AMOUNT_PAISE = Number(process.env.ACCESS_PASS_AMOUNT_PAISE ?? 49900);

/**
 * The exact amount, in paise, that the shared Razorpay payment page charges for
 * an access pass (the ₹1 link). The account-wide webhook also receives the
 * CEO's other product sales (₹799/₹999/…), so a shared-link unlock is gated to
 * *exactly* this amount — nothing else on the account unlocks an exam pass.
 */
export const SHARED_LINK_UNLOCK_PAISE = Number(process.env.SHARED_LINK_UNLOCK_PAISE ?? 100);

@Injectable()
export class AccessPassService {
    private readonly logger = new Logger(AccessPassService.name);
    private razorpay: Razorpay;

    constructor(
        private prisma: PrismaService,
        private notifications: NotificationService,
    ) {
        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!,
        });
    }

    /**
     * The single source of truth for "may this student sit a paid exam?".
     * `AttemptService` calls this, so the answer cannot be bypassed by the UI.
     */
    async hasActivePass(userId: string): Promise<boolean> {
        const pass = await this.prisma.accessPass.findUnique({
            where: { userId },
            select: { status: true },
        });
        return pass?.status === AccessPassStatus.ACTIVE;
    }

    /**
     * What the student's unlock page renders.
     *
     * `examId` is optional: pass it to also learn whether *that* exam needs a
     * pass at all, so the device-check page can stay quiet for the free
     * practice paper instead of warning about a lock that will never apply.
     */
    async getMyPass(userId: string, examId?: string) {
        const pass = await this.prisma.accessPass.findUnique({
            where: { userId },
            include: { payment: { select: { status: true, createdAt: true, razorpayPaymentId: true } } },
        });

        return {
            status: pass?.status ?? null,
            isActive: pass?.status === AccessPassStatus.ACTIVE,
            amount: pass?.amount ?? ACCESS_PASS_AMOUNT_PAISE,
            grantedAt: pass?.grantedAt ?? null,
            payment: pass?.payment ?? null,
            requiredForExam: examId ? !isDemoExam(examId) : null,
        };
    }

    /**
     * Create (or re-use) the Razorpay order for this student's pass.
     *
     * Idempotent: re-entering the page, refreshing mid-checkout or a double
     * click must not create a second order or charge twice. An already-active
     * pass short-circuits instead of creating anything.
     */
    async createOrder(userId: string) {
        const existing = await this.prisma.accessPass.findUnique({
            where: { userId },
            include: { payment: true },
        });

        if (existing?.status === AccessPassStatus.ACTIVE) {
            return { alreadyActive: true as const };
        }

        // Re-use the pending order rather than opening a second one.
        if (existing?.payment && existing.payment.status === PaymentStatus.CREATED) {
            return {
                alreadyActive: false as const,
                orderId: existing.payment.razorpayOrderId,
                amount: existing.payment.amount,
                currency: existing.payment.currency,
                key: process.env.RAZORPAY_KEY_ID,
                accessPassId: existing.id,
            };
        }

        const amount = ACCESS_PASS_AMOUNT_PAISE;
        if (!Number.isInteger(amount) || amount <= 0) {
            throw new BadRequestException('Access pass price is not configured correctly.');
        }

        const order = await this.razorpay.orders.create({
            amount,
            currency: 'INR',
            receipt: `accesspass_${userId}`.slice(0, 40),
            notes: { userId, kind: 'access_pass' },
        });

        const payment = await this.prisma.payment.create({
            data: {
                userId,
                razorpayOrderId: order.id,
                amount,
                currency: 'INR',
                status: PaymentStatus.CREATED,
            },
        });

        // A REVOKED pass is reactivated by paying again, so upsert rather than
        // create — the unique userId means a second create would just fail.
        const pass = await this.prisma.accessPass.upsert({
            where: { userId },
            create: { userId, paymentId: payment.id, amount, status: AccessPassStatus.PENDING },
            update: {
                paymentId: payment.id,
                amount,
                status: AccessPassStatus.PENDING,
                revokedAt: null,
            },
        });

        return {
            alreadyActive: false as const,
            orderId: order.id,
            amount,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
            accessPassId: pass.id,
        };
    }

    /**
     * Confirm the pass from the browser's checkout callback.
     *
     * The signature is what proves payment — never the client simply saying so.
     * The webhook confirms the same thing independently; whichever lands first
     * wins and the other is a no-op.
     */
    async verifyAndActivate(
        userId: string,
        razorpayOrderId: string,
        razorpayPaymentId: string,
        razorpaySignature: string,
    ) {
        const secret = process.env.RAZORPAY_KEY_SECRET!;
        const expected = crypto
            .createHmac('sha256', secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        // timingSafeEqual throws on length mismatch, which a malformed client
        // signature would otherwise turn into a 500.
        const a = Buffer.from(expected);
        const b = Buffer.from(razorpaySignature ?? '');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            throw new BadRequestException('Invalid payment signature');
        }

        const payment = await this.prisma.payment.findUnique({
            where: { razorpayOrderId },
            include: { accessPass: true },
        });
        if (!payment) throw new NotFoundException('Payment not found');

        // The order must belong to the caller — a valid signature for *someone
        // else's* order must not activate this student's pass.
        if (payment.userId !== userId) {
            throw new BadRequestException('This payment does not belong to your account');
        }
        if (!payment.accessPass) {
            throw new BadRequestException('This payment is not for an access pass');
        }

        await this.activate(payment.id, razorpayPaymentId, razorpaySignature);
        return this.getMyPass(userId);
    }

    /**
     * Mark a pass paid. Shared by the browser callback and the webhook, and
     * safe to run twice — the second call finds it already ACTIVE.
     */
    async activate(paymentId: string, razorpayPaymentId?: string, razorpaySignature?: string) {
        // Only mail on the transition into ACTIVE, so the browser callback and
        // the webhook confirming the same payment don't both send a receipt.
        const before = await this.prisma.accessPass.findUnique({
            where: { paymentId },
            select: { status: true },
        });

        await this.prisma.$transaction([
            this.prisma.payment.update({
                where: { id: paymentId },
                data: {
                    status: PaymentStatus.PAID,
                    ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
                    ...(razorpaySignature ? { razorpaySignature } : {}),
                },
            }),
            this.prisma.accessPass.update({
                where: { paymentId },
                data: {
                    status: AccessPassStatus.ACTIVE,
                    grantedAt: new Date(),
                    revokedAt: null,
                },
            }),
        ]);

        if (before?.status !== AccessPassStatus.ACTIVE) {
            const pass = await this.prisma.accessPass.findUnique({
                where: { paymentId },
                include: { user: { select: { email: true, firstName: true } } },
            });
            if (pass?.user) {
                await this.notifications.sendAccessPassActivated(
                    pass.user.email,
                    pass.user.firstName,
                    pass.amount,
                );
            }
        }
    }

    /** Refund/chargeback → the pass stops unlocking exams. */
    async revokeByPaymentId(paymentId: string) {
        const pass = await this.prisma.accessPass.findUnique({ where: { paymentId } });
        if (!pass) return;

        await this.prisma.accessPass.update({
            where: { id: pass.id },
            data: { status: AccessPassStatus.REVOKED, revokedAt: new Date() },
        });
        this.logger.warn(`Access pass ${pass.id} revoked (payment ${paymentId})`);
    }

    /**
     * Unlock a pass from a payment made on the shared Razorpay payment page
     * (the ₹1 access link), rather than an order this backend created.
     *
     * Such a payment has no Payment row of ours to key on, so the buyer is
     * matched to an account by the email / phone they typed on the hosted page.
     * This is only ever reached from the webhook, which has already verified
     * Razorpay's HMAC signature — a forged "someone paid" event cannot get here,
     * which is exactly the hole the unauthenticated Apps Script version has.
     *
     * Gated to the exact ₹1 amount so the CEO's other product links that share
     * the same account webhook (₹799/₹999/…) never hand out an exam pass.
     * Idempotent per Razorpay payment id, since webhooks are retried.
     */
    async grantFromSharedLink(entity: any): Promise<
        { status: 'granted' | 'already' | 'ignored' | 'unmatched' }
    > {
        const amount = Number(entity?.amount);
        if (!Number.isFinite(amount) || amount !== SHARED_LINK_UNLOCK_PAISE) {
            this.logger.log(
                `Shared-link webhook ignored: amount ${entity?.amount} ≠ ${SHARED_LINK_UNLOCK_PAISE} paise.`,
            );
            return { status: 'ignored' };
        }

        const razorpayPaymentId: string | undefined = entity?.id;
        if (!razorpayPaymentId) return { status: 'ignored' };

        // Webhooks are retried — if this exact payment is already recorded, the
        // pass was handled on the first delivery. Nothing more to do.
        const seen = await this.prisma.payment.findUnique({
            where: { razorpayPaymentId },
            select: { id: true },
        });
        if (seen) return { status: 'already' };

        // Match the payer to an account by what they entered on the hosted page.
        const email = String(entity?.email ?? '').trim();
        const contact = entity?.contact ? normalizePhone(String(entity.contact)) : null;

        let user = email
            ? await this.prisma.user.findFirst({
                  where: { email: { equals: email, mode: 'insensitive' } },
                  select: { id: true, email: true, firstName: true },
              })
            : null;
        if (!user && contact) {
            user = await this.prisma.user.findUnique({
                where: { phone: contact },
                select: { id: true, email: true, firstName: true },
            });
        }

        if (!user) {
            // A real ₹1 payment landed but we can't tie it to an account — the
            // payer used a different email/phone than they registered with.
            // Surface it for a manual grant rather than silently dropping money.
            this.logger.warn(
                `Shared-link ₹1 payment ${razorpayPaymentId} matched no account ` +
                    `(email="${email}", contact="${contact ?? ''}") — needs a manual grant.`,
            );
            return { status: 'unmatched' };
        }

        // Record the payment so the pass has an auditable money trail. A payment
        // page still carries an order_id; fall back to a synthetic unique id if
        // Razorpay ever omits it, so the required unique column is always filled.
        const orderId: string = entity?.order_id ?? `sharedlink_${razorpayPaymentId}`;
        const payment = await this.prisma.payment.create({
            data: {
                userId: user.id,
                razorpayOrderId: orderId,
                razorpayPaymentId,
                amount,
                currency: String(entity?.currency ?? 'INR'),
                status: PaymentStatus.PAID,
            },
        });

        const before = await this.prisma.accessPass.findUnique({
            where: { userId: user.id },
            select: { status: true },
        });

        await this.prisma.accessPass.upsert({
            where: { userId: user.id },
            create: {
                userId: user.id,
                paymentId: payment.id,
                amount,
                status: AccessPassStatus.ACTIVE,
                grantedAt: new Date(),
            },
            update: {
                paymentId: payment.id,
                amount,
                status: AccessPassStatus.ACTIVE,
                grantedAt: new Date(),
                revokedAt: null,
            },
        });

        // Only mail on the transition into ACTIVE, so a retried webhook or a
        // student who was already unlocked isn't thanked twice.
        if (before?.status !== AccessPassStatus.ACTIVE) {
            await this.notifications.sendAccessPassActivated(user.email, user.firstName, amount);
        }

        this.logger.log(`Shared-link ₹1 unlock granted to ${user.email} (payment ${razorpayPaymentId}).`);
        return { status: 'granted' };
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    async adminList(status?: string) {
        return this.prisma.accessPass.findMany({
            where: status ? { status: status as AccessPassStatus } : {},
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
                payment: { select: { amount: true, status: true, razorpayPaymentId: true, createdAt: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }

    /** Manual grant — for offline/cash payments and support fixes. */
    async adminGrant(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.accessPass.upsert({
            where: { userId },
            create: {
                userId,
                amount: 0,
                status: AccessPassStatus.ACTIVE,
                grantedAt: new Date(),
            },
            update: { status: AccessPassStatus.ACTIVE, grantedAt: new Date(), revokedAt: null },
        });
    }

    async adminRevoke(userId: string) {
        const pass = await this.prisma.accessPass.findUnique({ where: { userId } });
        if (!pass) throw new NotFoundException('This student has no access pass');

        return this.prisma.accessPass.update({
            where: { id: pass.id },
            data: { status: AccessPassStatus.REVOKED, revokedAt: new Date() },
        });
    }
}
