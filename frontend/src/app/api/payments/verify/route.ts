import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = await request.json();

        const secret = process.env.RAZORPAY_KEY_SECRET!;
        const body = `${razorpayOrderId}|${razorpayPaymentId}`;
        const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
        const valid = crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(razorpaySignature, 'hex'),
        );

        if (!valid) return NextResponse.json({ message: 'Invalid payment signature' }, { status: 400 });

        await prisma.payment.updateMany({
            where: { razorpayOrderId },
            data: { razorpayPaymentId, razorpaySignature, status: PaymentStatus.PAID },
        });

        const payment = await prisma.payment.findUnique({
            where: { razorpayOrderId },
            include: { booking: true },
        });

        if (payment?.booking) {
            await prisma.booking.update({
                where: { id: payment.booking.id },
                data: { status: BookingStatus.CONFIRMED },
            });
        }

        return NextResponse.json({ success: true, bookingId: payment?.booking?.id });
    } catch (error: any) {
        console.error('Verify payment error:', error);
        return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
    }
}
