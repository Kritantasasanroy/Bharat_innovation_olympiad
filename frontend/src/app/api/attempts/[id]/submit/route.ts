import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userPayload = getUserFromRequest(request);
        if (!userPayload) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { id: attemptId } = await params;
        if (!attemptId) return NextResponse.json({ message: 'Attempt ID required' }, { status: 400 });

        const attempt = await prisma.attempt.findUnique({
            where: { id: attemptId },
            include: {
                items: { include: { question: true } },
                examInstance: { include: { exam: { include: { sections: { include: { questions: true } } } } } }
            }
        });

        if (!attempt || attempt.userId !== userPayload.sub) {
            return NextResponse.json({ message: 'Attempt not found' }, { status: 404 });
        }

        if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
            return NextResponse.json({ message: 'Already submitted' }, { status: 400 });
        }

        // Grade the exam
        let totalScore = 0;
        let maxScore = attempt.examInstance.exam.totalMarks;

        for (const item of attempt.items) {
            const q = item.question;
            let isCorrect = false;

            // Simple grading logic for MCQ (Assuming options is array of {id, text, isCorrect})
            if (q.type === 'MCQ' || q.type === 'TRUE_FALSE') {
                const options = q.options as any[];
                if (options) {
                    const selectedOpt = options.find((o: any, i: number) => {
                        const optId = o.id || i.toString();
                        return optId === item.answer;
                    });
                    if (selectedOpt && selectedOpt.isCorrect) {
                        isCorrect = true;
                    }
                }
            }

            // Update item score
            const score = isCorrect ? q.marks : (item.answer ? -q.negativeMarks : 0);
            totalScore += score;

            await prisma.attemptItem.update({
                where: { id: item.id },
                data: { isCorrect, score }
            });
        }

        // Update overall attempt
        const updatedAttempt = await prisma.attempt.update({
            where: { id: attemptId },
            data: {
                status: 'SUBMITTED',
                submittedAt: new Date(),
                totalScore,
                maxScore
            }
        });

        return NextResponse.json(updatedAttempt);

    } catch (error: any) {
        console.error('Submit Exam Error:', error);
        return NextResponse.json({ message: error.message || 'Internal server error', stack: error.stack }, { status: 500 });
    }
}
