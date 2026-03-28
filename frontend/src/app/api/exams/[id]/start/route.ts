import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: instanceId } = await params;
        if (!instanceId) return NextResponse.json({ message: 'Instance ID is required' }, { status: 400 });

        const instance = await prisma.examInstance.findUnique({
            where: { id: instanceId },
        });

        if (!instance) return NextResponse.json({ message: 'Exam instance not found' }, { status: 404 });

        const existingAttempt = await prisma.attempt.findFirst({
            where: {
                userId: userPayload.sub,
                examInstanceId: instanceId,
            }
        });

        if (existingAttempt) {
            // If already submitted, prevent restart
            if (existingAttempt.status === 'SUBMITTED' || existingAttempt.status === 'AUTO_SUBMITTED') {
                return NextResponse.json({ message: 'Exam already submitted' }, { status: 400 });
            }
            // Return existing attempt to resume
            return NextResponse.json(existingAttempt);
        }

        // Create new attempt
        const newAttempt = await prisma.attempt.create({
            data: {
                userId: userPayload.sub,
                examInstanceId: instanceId,
                status: 'IN_PROGRESS',
                startedAt: new Date(),
            }
        });

        return NextResponse.json(newAttempt);

    } catch (error: any) {
        console.error('Start Exam Error:', error);
        return NextResponse.json({ message: error.message || 'Internal server error', stack: error.stack }, { status: 500 });
    }
}
