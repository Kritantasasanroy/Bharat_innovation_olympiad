import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: bookingId } = await params;

        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });

        if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
        if (booking.userId !== userPayload.sub) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

        return NextResponse.json(booking);
    } catch (error) {
        console.error('Get booking error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
