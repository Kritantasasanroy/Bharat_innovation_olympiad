const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const classBand = 6;
    const userId = "0b57ef62-403e-43b8-bfd7-0ccd5d088f29"; // kritantasasan@gmail.com

    const exams = await prisma.exam.findMany({
        where: {
            classBands: { has: classBand },
            instances: {
                some: {
                    endsAt: { gte: new Date() },
                },
            },
        },
        include: {
            sections: { select: { id: true, title: true, sortOrder: true } },
            instances: {
                where: { endsAt: { gte: new Date() } },
                orderBy: { startsAt: 'asc' },
                include: {
                    attempts: {
                        where: { userId }
                    }
                }
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const completedAttempts = await prisma.attempt.findMany({
        where: {
            userId,
            status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
            examInstance: { examId: { in: exams.map(e => e.id) } }
        },
        include: { examInstance: { select: { examId: true } } }
    });

    const completedExamIds = new Set(completedAttempts.map(a => a.examInstance.examId));

    const result = exams.map(exam => ({
        ...exam,
        isCompleted: completedExamIds.has(exam.id)
    }));

    console.log(JSON.stringify(result.map(e => ({ title: e.title, isCompleted: e.isCompleted })), null, 2));
}

main().finally(() => prisma.$disconnect());
