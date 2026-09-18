const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const exams = await p.exam.findMany({
        select: { id: true, title: true, classBands: true, isPublished: true, isTrial: true, isArchived: true, totalMarks: true, durationMinutes: true, requiresSlot: true, requiresTrial: true, _count: { select: { sections: true, instances: true } } },
        orderBy: { createdAt: 'desc' },
        take: 15,
    });
    console.log(JSON.stringify(exams, null, 1));
    await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
