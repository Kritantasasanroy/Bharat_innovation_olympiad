import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload || !userPayload.sub) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: userPayload.sub },
            include: { attempts: true },
        });

        if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

        const submittedExamInstanceIds = user.attempts
            .filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
            .map(a => a.examInstanceId);

        const instances = await prisma.examInstance.findMany({
            where: {
                startsAt: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // next 7 days or active
                id: { notIn: submittedExamInstanceIds },
                exam: { classBands: { has: user.classBand }, isPublished: true },
            },
            include: { exam: true },
            orderBy: { startsAt: 'asc' },
            take: 5
        });

        const upcoming = instances.map(inst => {
            const now = new Date();
            let status = 'UPCOMING';
            if (now >= inst.startsAt && now <= inst.endsAt) status = 'ACTIVE';
            else if (now > inst.endsAt) status = 'EXPIRED';

            return {
                id: inst.exam.id, // Or instance id? The dashboard uses exam.id to go to /exams/[id]/instructions
                title: inst.exam.title,
                scheduledAt: inst.startsAt,
                durationMinutes: inst.exam.durationMinutes,
                status
            };
        });

        return NextResponse.json(upcoming.filter(u => u.status !== 'EXPIRED'));

    } catch (error) {
        console.error('Fetch Upcoming Exams Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
