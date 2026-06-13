import {
    BadRequestException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentService {
    private razorpay: Razorpay;

    constructor(private prisma: PrismaService) {
        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!,
        });
    }

    async createOrder(userId: string, bookingId: string, couponCode?: string) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });

        if (!booking) throw new NotFoundException('Booking not found');
        if (booking.userId !== userId) throw new UnauthorizedException();
        if (booking.status === BookingStatus.CONFIRMED) {
            return { alreadyPaid: true, booking };
        }
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Booking has been cancelled');
        }

        // Return existing order if one was already created
        if (booking.payment) {
            return {
                orderId: booking.payment.razorpayOrderId,
                amount: booking.payment.amount,
                currency: booking.payment.currency,
                key: process.env.RAZORPAY_KEY_ID,
                bookingId,
                paymentId: booking.payment.id,
            };
        }

        let feeAmount = booking.slot.examInstance.exam.feeAmount ?? 0;
        let couponId: string | undefined;

        // Apply coupon if provided
        if (couponCode) {
            const coupon = await this.prisma.coupon.findUnique({
                where: { code: couponCode.toUpperCase() },
            });
            if (!coupon) throw new BadRequestException('Invalid coupon code');
            if (coupon.usedCount >= coupon.maxUses) {
                throw new BadRequestException('Coupon usage limit reached');
            }
            const now = new Date();
            if (coupon.expiresAt && now > coupon.expiresAt) {
                throw new BadRequestException('Coupon has expired');
            }
            feeAmount = Math.round(feeAmount * (1 - coupon.discountPct / 100));
            couponId = coupon.id;

            await this.prisma.coupon.update({
                where: { id: coupon.id },
                data: { usedCount: { increment: 1 } },
            });
        }

        if (feeAmount === 0) {
            // Free after coupon — confirm booking directly
            await this.prisma.booking.update({
                where: { id: bookingId },
                data: { status: BookingStatus.CONFIRMED },
            });
            return { alreadyPaid: true, amount: 0, booking };
        }

        // Create Razorpay order
        const order = await this.razorpay.orders.create({
            amount: feeAmount,
            currency: 'INR',
            receipt: `booking_${bookingId}`,
            notes: {
                bookingId,
                userId,
                examTitle: booking.slot.examInstance.exam.title,
            },
        });

        // Persist Payment row
        const payment = await this.prisma.payment.create({
            data: {
                userId,
                razorpayOrderId: order.id,
                amount: feeAmount,
                currency: 'INR',
                status: PaymentStatus.CREATED,
                ...(couponId && { couponId }),
            },
        });

        // Link payment to booking
        await this.prisma.booking.update({
            where: { id: bookingId },
            data: { paymentId: payment.id },
        });

        return {
            orderId: order.id,
            amount: feeAmount,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
            bookingId,
            paymentId: payment.id,
        };
    }

    verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
        const expected = crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }

    async handleWebhookEvent(event: any) {
        const eventType: string = event.event;

        if (eventType === 'payment.captured' || eventType === 'payment.authorized') {
            const entity = event.payload?.payment?.entity;
            if (!entity) return;
            await this.onPaymentCaptured(entity);
        }

        if (eventType === 'payment.failed') {
            const entity = event.payload?.payment?.entity;
            if (!entity) return;
            await this.onPaymentFailed(entity);
        }

        if (eventType === 'refund.processed') {
            const entity = event.payload?.refund?.entity;
            if (!entity) return;
            await this.onRefundProcessed(entity);
        }
    }

    private async onPaymentCaptured(entity: any) {
        const payment = await this.prisma.payment.findUnique({
            where: { razorpayOrderId: entity.order_id },
            include: { booking: true },
        });
        if (!payment) return;

        await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
                razorpayPaymentId: entity.id,
                razorpaySignature: entity.description ?? null,
                status: PaymentStatus.PAID,
            },
        });

        if (payment.booking) {
            await this.prisma.booking.update({
                where: { id: payment.booking.id },
                data: { status: BookingStatus.CONFIRMED },
            });
        }
    }

    private async onPaymentFailed(entity: any) {
        await this.prisma.payment.updateMany({
            where: { razorpayOrderId: entity.order_id },
            data: { status: PaymentStatus.FAILED },
        });
    }

    private async onRefundProcessed(entity: any) {
        await this.prisma.payment.updateMany({
            where: { razorpayPaymentId: entity.payment_id },
            data: { status: PaymentStatus.REFUNDED },
        });
    }

    // Called from frontend after checkout.js success to double-verify before showing success screen
    async verifyPaymentSignature(
        razorpayOrderId: string,
        razorpayPaymentId: string,
        razorpaySignature: string,
    ) {
        const secret = process.env.RAZORPAY_KEY_SECRET!;
        const body = `${razorpayOrderId}|${razorpayPaymentId}`;
        const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
        const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpaySignature));

        if (!valid) throw new BadRequestException('Invalid payment signature');

        // Mark payment as paid (in case webhook hasn't arrived yet)
        await this.prisma.payment.updateMany({
            where: { razorpayOrderId },
            data: {
                razorpayPaymentId,
                razorpaySignature,
                status: PaymentStatus.PAID,
            },
        });

        const payment = await this.prisma.payment.findUnique({
            where: { razorpayOrderId },
            include: { booking: true },
        });

        if (payment?.booking) {
            await this.prisma.booking.update({
                where: { id: payment.booking.id },
                data: { status: BookingStatus.CONFIRMED },
            });
        }

        return { success: true, payment };
    }

    async getMyPayments(userId: string) {
        return this.prisma.payment.findMany({
            where: { userId },
            include: {
                booking: { include: { slot: { include: { examInstance: { include: { exam: true } } } } } },
                coupon: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async adminListPayments(status?: string) {
        return this.prisma.payment.findMany({
            where: status ? { status: status as PaymentStatus } : {},
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
                booking: { include: { slot: { include: { examInstance: { include: { exam: true } } } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }

    async adminRefund(paymentId: string) {
        const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.status !== PaymentStatus.PAID) {
            throw new BadRequestException('Only paid payments can be refunded');
        }
        if (!payment.razorpayPaymentId) throw new BadRequestException('No Razorpay payment ID on record');

        await this.razorpay.payments.refund(payment.razorpayPaymentId, { amount: payment.amount });

        return this.prisma.payment.update({
            where: { id: paymentId },
            data: { status: PaymentStatus.REFUNDED },
        });
    }

    // ── Coupon management ─────────────────────────────────────────────────────

    async createCoupon(data: {
        code: string;
        discountPct: number;
        maxUses: number;
        expiresAt?: string;
    }) {
        return this.prisma.coupon.create({
            data: {
                code: data.code.toUpperCase(),
                discountPct: data.discountPct,
                maxUses: data.maxUses,
                expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
            },
        });
    }

    async listCoupons() {
        return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    }

    async validateCoupon(code: string) {
        const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
        if (!coupon) return { valid: false, reason: 'Coupon not found' };
        if (coupon.usedCount >= coupon.maxUses) return { valid: false, reason: 'Usage limit reached' };
        if (coupon.expiresAt && new Date() > coupon.expiresAt) return { valid: false, reason: 'Expired' };
        return { valid: true, discountPct: coupon.discountPct, code: coupon.code };
    }
}
