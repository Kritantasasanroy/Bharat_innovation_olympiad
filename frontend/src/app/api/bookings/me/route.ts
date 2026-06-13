import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { BookingStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        if (!examId) return NextResponse.json({ message: 'examId required' }, { status: 400 });

        const booking = await prisma.booking.findFirst({
            where: {
                userId: userPayload.sub,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstance: { examId } },
            },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });

        return NextResponse.json(booking);
    } catch (error) {
        console.error('My booking error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
