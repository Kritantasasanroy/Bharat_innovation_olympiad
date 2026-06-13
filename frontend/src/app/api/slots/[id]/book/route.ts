import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { BookingStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: slotId } = await params;
        const userId = userPayload.sub;

        const slot = await prisma.examSlot.findUnique({
            where: { id: slotId },
            include: { examInstance: { include: { exam: true } } },
        });

        if (!slot) return NextResponse.json({ message: 'Slot not found' }, { status: 404 });

        const now = new Date();
        if (now > slot.endsAt) {
            return NextResponse.json({ message: 'Slot has already ended' }, { status: 400 });
        }

        // Check for existing active booking for this exam
        const existing = await prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstance: { examId: slot.examInstance.examId } },
            },
            include: { slot: true },
        });
        if (existing) {
            return NextResponse.json(
                { message: 'You already have an active booking for this exam', existingBooking: existing },
                { status: 409 },
            );
        }

        const feeAmount = slot.examInstance.exam.feeAmount ?? 0;

        // Atomic capacity check + booking creation
        const result = await prisma.$transaction(async (tx) => {
            const fresh = await tx.examSlot.findUnique({ where: { id: slotId } });
            if (!fresh || fresh.booked >= fresh.capacity) {
                throw new Error('SLOT_FULL');
            }
            await tx.examSlot.update({
                where: { id: slotId },
                data: { booked: { increment: 1 } },
            });

            const status = feeAmount === 0 ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
            const booking = await tx.booking.create({
                data: { userId, slotId, status },
                include: { slot: { include: { examInstance: { include: { exam: true } } } } },
            });
            return { booking, requiresPayment: feeAmount > 0, amount: feeAmount };
        });

        return NextResponse.json(result);
    } catch (error: any) {
        if (error.message === 'SLOT_FULL') {
            return NextResponse.json({ message: 'This slot is full' }, { status: 409 });
        }
        console.error('Book slot error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
