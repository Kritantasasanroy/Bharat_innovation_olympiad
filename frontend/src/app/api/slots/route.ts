import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const examInstanceId = searchParams.get('examInstanceId');
        const examId = searchParams.get('examId');

        if (!examInstanceId && !examId) {
            return NextResponse.json({ message: 'examInstanceId or examId required' }, { status: 400 });
        }

        const slots = await prisma.examSlot.findMany({
            where: examInstanceId ? { examInstanceId } : { examInstance: { examId: examId! } },
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });

        return NextResponse.json(slots);
    } catch (error) {
        console.error('List slots error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
