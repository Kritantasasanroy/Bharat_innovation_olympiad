import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { bookingId, couponCode } = await request.json();
        const userId = userPayload.sub;

        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });

        if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
        if (booking.userId !== userId) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

        if (booking.status === BookingStatus.CONFIRMED) {
            return NextResponse.json({ alreadyPaid: true, booking });
        }

        // Return existing unpaid order
        if (booking.payment && booking.payment.status === PaymentStatus.CREATED) {
            return NextResponse.json({
                orderId: booking.payment.razorpayOrderId,
                amount: booking.payment.amount,
                currency: booking.payment.currency,
                key: process.env.RAZORPAY_KEY_ID,
                bookingId,
                paymentId: booking.payment.id,
            });
        }

        let feeAmount = booking.slot.examInstance.exam.feeAmount ?? 0;
        let couponId: string | undefined;

        if (couponCode) {
            const coupon = await prisma.coupon.findUnique({
                where: { code: (couponCode as string).toUpperCase() },
            });
            if (!coupon || coupon.usedCount >= coupon.maxUses) {
                return NextResponse.json({ message: 'Invalid or expired coupon' }, { status: 400 });
            }
            if (coupon.expiresAt && new Date() > coupon.expiresAt) {
                return NextResponse.json({ message: 'Coupon has expired' }, { status: 400 });
            }
            feeAmount = Math.round(feeAmount * (1 - coupon.discountPct / 100));
            couponId = coupon.id;
            await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
        }

        if (feeAmount === 0) {
            await prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.CONFIRMED } });
            return NextResponse.json({ alreadyPaid: true, amount: 0 });
        }

        const order = await razorpay.orders.create({
            amount: feeAmount,
            currency: 'INR',
            receipt: `booking_${bookingId}`,
            notes: { bookingId, userId, examTitle: booking.slot.examInstance.exam.title },
        });

        const payment = await prisma.payment.create({
            data: {
                userId,
                razorpayOrderId: order.id,
                amount: feeAmount,
                currency: 'INR',
                status: PaymentStatus.CREATED,
                ...(couponId && { couponId }),
            },
        });

        await prisma.booking.update({ where: { id: bookingId }, data: { paymentId: payment.id } });

        return NextResponse.json({
            orderId: order.id,
            amount: feeAmount,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
            bookingId,
            paymentId: payment.id,
        });
    } catch (error: any) {
        console.error('Create order error:', error);
        return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
    }
}
