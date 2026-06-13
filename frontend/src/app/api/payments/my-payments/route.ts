import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const payments = await prisma.payment.findMany({
            where: { userId: userPayload.sub },
            include: {
                booking: {
                    include: { slot: { include: { examInstance: { include: { exam: true } } } } },
                },
                coupon: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(payments);
    } catch (error) {
        console.error('My payments error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
