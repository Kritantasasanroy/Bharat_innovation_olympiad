const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    for (const title of ['Bharat Innovation Olympiad — Class 11', 'Bharat Innovation Olympiad — Class 8']) {
        const exam = await p.exam.findFirst({
            where: { title },
            include: {
                sections: { orderBy: { sortOrder: 'asc' }, include: { sectionQuestions: { select: { questionId: true } } } },
                instances: { include: { _count: { select: { slots: true, slotTimings: true, scheduleDates: true } } } },
            },
        });
        if (!exam) { console.log('missing:', title); continue; }
        const inst = await p.examInstance.findFirst({ where: { examId: exam.id }, include: { _count: { select: { slots: true, slotTimings: true, scheduleDates: true } } } });
        console.log(JSON.stringify({
            title: exam.title,
            totalMarks: exam.totalMarks,
            published: exam.isPublished,
            sections: exam.sections.map((s) => ({ title: s.title, n: s.sectionQuestions.length })),
            instance: { window: [inst.startsAt, inst.endsAt], slots: inst._count.slots, timings: inst._count.slotTimings, dates: inst._count.scheduleDates },
            slotSample: (await p.examSlot.findFirst({ where: { examInstanceId: inst.id }, orderBy: { startsAt: 'asc' }, select: { label: true, startsAt: true, endsAt: true, capacity: true } })),
        }, null, 1));
    }
    await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
