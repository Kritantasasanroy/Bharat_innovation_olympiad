import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: examId } = await params;
        if (!examId) return NextResponse.json({ message: 'Exam ID is required' }, { status: 400 });

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            include: {
                instances: {
                    where: {
                        startsAt: { lte: new Date() },
                        endsAt: { gte: new Date() },
                    }
                },
                sections: {
                    include: { questions: true },
                    orderBy: { sortOrder: 'asc' }
                }
            }
        });

        if (!exam) return NextResponse.json({ message: 'Exam not found' }, { status: 404 });

        return NextResponse.json(exam);

    } catch (error) {
        console.error('Fetch Exam Detail Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
