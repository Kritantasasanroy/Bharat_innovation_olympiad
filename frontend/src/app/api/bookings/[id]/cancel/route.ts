import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { BookingStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: bookingId } = await params;

        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
        if (booking.userId !== userPayload.sub) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
        if (booking.status === BookingStatus.CANCELLED) {
            return NextResponse.json({ message: 'Already cancelled' }, { status: 400 });
        }

        await prisma.$transaction([
            prisma.booking.update({
                where: { id: bookingId },
                data: { status: BookingStatus.CANCELLED },
            }),
            prisma.examSlot.update({
                where: { id: booking.slotId },
                data: { booked: { decrement: 1 } },
            }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Cancel booking error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
