import prisma from '@/lib/prisma';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-razorpay-signature') ?? '';
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const valid = crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(signature, 'hex'),
        );

        if (!valid) return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });

        const event = JSON.parse(rawBody);

        if (event.event === 'payment.captured' || event.event === 'payment.authorized') {
            const entity = event.payload?.payment?.entity;
            if (entity?.order_id) {
                await prisma.payment.updateMany({
                    where: { razorpayOrderId: entity.order_id },
                    data: { razorpayPaymentId: entity.id, status: PaymentStatus.PAID },
                });
                const payment = await prisma.payment.findUnique({
                    where: { razorpayOrderId: entity.order_id },
                    include: { booking: true },
                });
                if (payment?.booking) {
                    await prisma.booking.update({
                        where: { id: payment.booking.id },
                        data: { status: BookingStatus.CONFIRMED },
                    });
                }
            }
        }

        if (event.event === 'payment.failed') {
            const entity = event.payload?.payment?.entity;
            if (entity?.order_id) {
                await prisma.payment.updateMany({
                    where: { razorpayOrderId: entity.order_id },
                    data: { status: PaymentStatus.FAILED },
                });
            }
        }

        if (event.event === 'refund.processed') {
            const entity = event.payload?.refund?.entity;
            if (entity?.payment_id) {
                await prisma.payment.updateMany({
                    where: { razorpayPaymentId: entity.payment_id },
                    data: { status: PaymentStatus.REFUNDED },
                });
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
