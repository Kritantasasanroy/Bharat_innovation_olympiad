import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: attemptId } = await params;
        const body = await request.json();
        const { questionId, answer } = body;

        if (!attemptId || !questionId) {
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        const attempt = await prisma.attempt.findUnique({
            where: { id: attemptId }
        });

        if (!attempt || attempt.userId !== userPayload.sub) {
            return NextResponse.json({ message: 'Attempt not found' }, { status: 404 });
        }

        if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
            return NextResponse.json({ message: 'Exam already submitted' }, { status: 400 });
        }

        // Upsert the answer
        const existingItem = await prisma.attemptItem.findFirst({
            where: { attemptId, questionId }
        });

        if (existingItem) {
            await prisma.attemptItem.update({
                where: { id: existingItem.id },
                data: { answer, answeredAt: new Date() }
            });
        } else {
            await prisma.attemptItem.create({
                data: {
                    attemptId,
                    questionId,
                    answer,
                    answeredAt: new Date()
                }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Save Answer Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
