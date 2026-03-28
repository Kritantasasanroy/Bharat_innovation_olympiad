import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request: Request) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const attempts = await prisma.attempt.findMany({
            where: {
                userId: userPayload.sub,
                status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] }
            },
            include: {
                examInstance: {
                    include: { exam: true }
                }
            },
            orderBy: { submittedAt: 'desc' },
            take: 5
        });

        const results = await Promise.all(attempts.map(async (attempt) => {
            const isReleased = attempt.examInstance.exam.isResultReleased;
            let rank = undefined;
            if (isReleased) {
                const higherScores = await prisma.attempt.count({
                    where: {
                        examInstanceId: attempt.examInstanceId,
                        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
                        totalScore: { gt: attempt.totalScore || 0 }
                    }
                });
                rank = higherScores + 1;
            }

            return {
                id: attempt.id,
                examTitle: attempt.examInstance.exam.title,
                score: isReleased ? (attempt.totalScore || 0) : null,
                totalMarks: attempt.maxScore || 0,
                rank,
                isReleased,
                completedAt: attempt.submittedAt || attempt.startedAt,
            };
        }));

        return NextResponse.json(results);

    } catch (error) {
        console.error('Fetch Recent Results Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
