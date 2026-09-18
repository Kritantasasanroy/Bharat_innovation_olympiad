/**
 * Adds the "Super Olympiad" bonus section — 5 questions at +2 / −1 — to the
 * Class 11 and Class 8 olympiad exams created by create-class-exams.js.
 * Idempotent: a section titled "Super Olympiad" is not duplicated.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const SUPER_QUESTIONS = [
    {
        text: 'A city has ₹10 lakh and one year to cut single-use plastic. Which plan is most likely to produce a real, lasting reduction?',
        options: [
            'Measure waste in 50 hotspots, pilot two interventions, and scale only what the data proves works',
            'Announce a city-wide ban on day one and enforce it with heavy fines',
            'Hold one large awareness rally and hope behaviour changes',
            'Copy another country\'s solution without adapting it locally',
        ],
        correct: 0,
        explanation: 'Pilot → measure → scale: an intervention proven on a small sample protects the budget before the city commits fully.',
    },
    {
        text: 'A flood-alert app reached 10,000 people 40 minutes before the flood, but most did not act. What is the strongest single improvement?',
        options: [
            { text: 'Co-design the alert with the community so it says exactly what to do and where to go, then rehearse it', correct: true },
            { text: 'Send the alert more frequently and louder', correct: false },
            { text: 'Add more languages to the same message', correct: false },
            { text: 'Add a paid premium alert tier', correct: false },
        ],
    },
    {
        text: 'A startup has 10,000 free users and zero paying customers. Which experiment gives the most reliable signal about what to build next?',
        options: [
            { text: 'Interview the most active users, then test one price on a small group while the rest keep free access', correct: true },
            { text: 'Double the price for everyone to filter for serious buyers', correct: false },
            { text: 'Copy the market leader\'s pricing page exactly', correct: false },
            { text: 'Add five more free features and wait', correct: false },
        ],
    },
    {
        text: 'A school wants to cut electricity use by 20% in one term without affecting classes. Which plan is most likely to work?',
        options: [
            { text: 'Motion-sensor lights in low-use areas plus a monthly class-wise energy dashboard the school publishes', correct: true },
            { text: 'Replace all bulbs with dimmer ones and tell no one', correct: false },
            { text: 'Ask students to study in daylight only', correct: false },
            { text: 'Switch off the fans for two hours daily', correct: false },
        ],
    },
    {
        text: 'Two school teams get the same problem and the same budget. One interviews 30 users before building; the other builds for three months in secret. Which outcome is most likely and why?',
        options: [
            { text: 'The interviewing team builds the right thing faster, because early evidence beats late polish', correct: true },
            { text: 'The secret team wins because surprise is a strategy', correct: false },
            { text: 'Both teams will always get identical results', correct: false },
            { text: 'The secret team wins because users cannot be trusted with early ideas', correct: false },
        ],
    },
];

async function main() {
    for (const title of ['Bharat Innovation Olympiad — Class 11', 'Bharat Innovation Olympiad — Class 8']) {
        const exam = await p.exam.findFirst({ where: { title }, include: { sections: true } });
        if (!exam) { console.log(`exam not found: ${title}`); continue; }
        const existing = await p.examSection.findFirst({ where: { examId: exam.id, title: 'Super Olympiad' } });
        if (existing) { console.log(`super section exists on: ${exam.title}`); continue; }

        const section = await p.examSection.create({
            data: { examId: exam.id, title: 'Super Olympiad', sortOrder: 5 },
        });
        for (let i = 0; i < superQuestions.length; i += 1) {
            const q = superQuestions[i];
            const question = await p.question.create({
                data: {
                    type: 'MCQ',
                    difficulty: 'HARD',
                    text: q.text,
                    options: q.options.map((opt, idx) => ({ id: String(idx), text: opt, isCorrect: idx === q.correct })),
                    correctAnswer: null,
                    marks: 2,
                    negativeMarks: 1,
                    tags: ['super-olympiad', 'bonus'],
                    partCode: 'SO',
                    partName: 'Super Olympiad',
                    sectionName: 'Super Olympiad',
                    explanation: q.explanation,
                },
            });
            await p.sectionQuestion.create({ data: { sectionId: superSection.id, questionId: question.id, sortOrder: i } });
        }
        console.log(`super section added: ${exam.title}`);
    }
    await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
