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
        });

        const results = await Promise.all(attempts.map(async (attempt) => {
            const isReleased = attempt.examInstance.exam.isResultReleased;
            
            const totalStudents = await prisma.attempt.count({
                where: {
                    examInstanceId: attempt.examInstanceId,
                    status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
                }
            });

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

            const score = attempt.totalScore || 0;
            const total = attempt.maxScore || 1;
            const percentage = Math.round((score / total) * 100);

            return {
                id: attempt.id,
                title: attempt.examInstance.exam.title,
                score: isReleased ? score : null,
                total,
                rank,
                totalStudents,
                isReleased,
                date: attempt.submittedAt ? attempt.submittedAt.toISOString().split('T')[0] : 'N/A',
                percentage: isReleased ? percentage : null
            };
        }));

        return NextResponse.json(results);

    } catch (error) {
        console.error('Fetch All Results Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
