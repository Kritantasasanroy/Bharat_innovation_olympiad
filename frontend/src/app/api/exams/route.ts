import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload || !userPayload.sub) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userPayload.sub },
            include: { attempts: true },
        });

        if (!user) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        // Find exams the user has already submitted
        const submittedExamInstanceIds = user.attempts
            .filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
            .map(a => a.examInstanceId);

        // Fetch available exams for their classBand
        const exams = await prisma.exam.findMany({
            where: {
                isPublished: true,
                classBands: { has: user.classBand },
                instances: {
                    some: {   // Has an active instance
                        startsAt: { lte: new Date() },
                        endsAt: { gte: new Date() },
                        id: { notIn: submittedExamInstanceIds }
                    }
                }
            },
            include: {
                _count: {
                    select: { sections: true }
                }
            }
        });

        return NextResponse.json(exams);

    } catch (error) {
        console.error('Fetch Exams Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
