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

/**
 * The one-off platform fee, in paise. A student pays this once and can then sit
 * every exam, so it is deliberately account-level rather than per-slot.
 */
export const ACCESS_PASS_AMOUNT_PAISE = Number(process.env.ACCESS_PASS_AMOUNT_PAISE ?? 49900);

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
