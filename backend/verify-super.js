const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const section = await p.examSection.findFirst({
        where: { title: 'Super Olympiad', exam: { title: 'Bharat Innovation Olympiad — Class 11' } },
        include: { sectionQuestions: { include: { question: { select: { text: true, marks: true, negativeMarks: true, options: true } } } } },
    });
    if (!section) { console.log('no super section'); return; }
    for (const sq of section.sectionQuestions) {
        const q = await p.question.findUnique({ where: { id: sq.questionId }, select: { text: true, marks: true, negativeMarks: true } });
        console.log(`[${q.marks}/${q.negativeMarks}] ${q.text.slice(0, 80)}`);
    }
    await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
