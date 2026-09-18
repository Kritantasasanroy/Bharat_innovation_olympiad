/**
 * Creates two slot-gated olympiad exams from the beta paper:
 *   - Class 11: sittings 22–25 Sep 2026, four hourly sittings a day from 11:00 IST, capacity 1
 *   - Class 8:  sittings 19–21 Sep 2026, same pattern
 * Both carry the beta paper's five sections (same question pool) plus a sixth
 * "Super Olympiad" bonus section: 5 questions at +2 correct / −1 incorrect.
 *
 * Idempotent: an exam whose title already exists is skipped entirely.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const BETA_EXAM_ID = '4017616c-a2c3-48f3-8e98-c99137a668bb';
const YEAR = 2026;
const MONTH = 8; // September, 0-based
const IST_OFFSET_MIN = 330; // IST = UTC + 5:30

/** Midnight IST of a calendar day, as the UTC instant the schema canonicalises on. */
function istMidnight(day) {
    return new Date(Date.UTC(YEAR, MONTH, day - 1, 18, 30, 0));
}
/** An IST wall-clock minute-of-day on a given date, as a UTC instant. */
function istAt(day, minute) {
    return new Date(istMidnight(day).getTime() + minute * 60000);
}
function hourLabel(startMinute) {
    const h24 = Math.floor(startMinute / 60) % 24;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:00 ${suffix}`;
}

/** The bonus round: 5 questions at +2 correct / −1 incorrect. */
const SUPER_QUESTIONS = [
    {
        text: 'A city has ₹10 lakh to cut single-use plastic within one year. Which plan is most likely to produce a real, lasting reduction?',
        options: [
            { text: 'Measure waste in 50 hotspots, pilot two interventions, then scale only what the data proves works', correct: true },
            { text: 'Announce a city-wide ban on day one and enforce it with heavy fines immediately', correct: false },
            { text: 'Hold one large awareness rally and hope behaviour changes on its own', correct: false },
            { text: 'Import another country\'s solution exactly as-is without testing it locally', correct: false },
        ],
    },
    {
        text: 'A flood-alert app reached 40,000 people but almost nobody acted on the warning. What is the strongest fix?',
        options: [
            { text: 'Co-design the alert with the community so it says exactly what to do, where to go, and rehearse it', correct: true },
            { text: 'Send the same alert more frequently and louder', correct: false },
            { text: 'Add ten more languages to the app', correct: false },
            { text: 'Add a paid premium alert tier', correct: false },
        ],
    },
    {
        text: 'Your school wants to cut electricity use by 20% this year without affecting classes. Which plan is most likely to work?',
        options: [
            { text: 'Motion-sensor lights in low-use areas plus a monthly class-wise energy dashboard', correct: true },
            { text: 'Replace all lights with dimmer bulbs and tell no one', correct: false },
            { text: 'Ask students to study in daylight only', correct: false },
            { text: 'Buy a generator as backup and change nothing else', correct: false },
        ],
    },
    {
        text: 'A water-purifying startup gives free trials to 500 families; nobody converts to paid. What should they do first?',
        options: [
            { text: 'Interview non-paying families to learn exactly why they did not convert, then change one thing and re-test', correct: true },
            { text: 'Spend the budget on more ads to get more free users', correct: false },
            { text: 'Raise the price to appear premium', correct: false },
            { text: 'Copy the market leader\'s pricing page', correct: false },
        ],
    },
    {
        text: 'A school wants to launch a student-run stationery store. Which decision shows the strongest entrepreneurial thinking?',
        options: [
            { text: 'Start with a two-week pre-order pilot in one class, then expand based on what sells', correct: true },
            { text: 'Stock every possible item on day one with borrowed money', correct: false },
            { text: 'Price everything at cost so nobody complains', correct: false },
            { text: 'Let each student buy whatever they want from the market instead', correct: false },
        ],
    },
];

async function main() {
    const beta = await p.exam.findUnique({
        where: { id: BETA_EXAM_ID },
        include: { sections: { orderBy: { sortOrder: 'asc' }, include: { sectionQuestions: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!beta) throw new Error('beta exam not found');

    const plans = [
        { title: 'Bharat Innovation Olympiad — Class 11', classBands: [11], dates: [22, 23, 24, 25] },
        { title: 'Bharat Innovation Olympiad — Class 8', classBands: [8], dates: [19, 20, 21] },
    ];

    for (const spec of plans) {
        const existing = await p.exam.findFirst({ where: { title: spec.title } });
        if (existing) { console.log(`skip (exists): ${spec.title}`); continue; }

        const exam = await p.exam.create({
            data: {
                title: spec.title,
                description: 'Bharat Innovation Olympiad examination — 55 questions · 60 marks · 60 minutes, including the Super Olympiad bonus round (+2 correct / −1 incorrect).',
                classBands: spec.classBands,
                totalMarks: 60,
                durationMinutes: 60,
                isPublished: true,
                requiresSlot: true,
                requiresTrial: true,
                feeAmount: null,
            },
        });

        // Sections: the beta paper's five sections, same question pool.
        for (const src of beta.sections) {
            const section = await p.examSection.create({
                data: { examId: exam.id, title: src.title, sortOrder: src.sortOrder, questionsToAssign: src.questionsToAssign },
            });
            for (const sq of src.sectionQuestions) {
                await p.sectionQuestion.create({
                    data: { sectionId: section.id, questionId: sq.questionId, sortOrder: sq.sortOrder },
                });
            }
        }

        // Super Olympiad — the bonus round: 5 questions at +2 / −1.
        const superSection = await p.examSection.create({
            data: { examId: exam.id, title: 'Super Olympiad', sortOrder: 5 },
        });
        for (let i = 0; i < SUPER_QUESTIONS.length; i += 1) {
            const q = SUPER_QUESTIONS[i];
            const question = await p.question.create({
                data: {
                    type: 'MCQ',
                    difficulty: 'HARD',
                    text: q.text,
                    options: q.options.map((opt, idx) => ({ id: String(idx), text: opt, isCorrect: idx === q.correctIndex })),
                    marks: 2,
                    negativeMarks: 1,
                    tags: ['super-olympiad', 'bonus'],
                    partCode: 'SO',
                    partName: 'Super Olympiad',
                    sectionName: 'Super Olympiad',
                    grade: spec.classBands[0],
                },
            });
            await p.sectionQuestion.create({ data: { sectionId: superSection.id, questionId: question.id, sortOrder: i } });
        }

        // Instance + calendar + four hourly sittings a day, capacity 1.
        const instance = await p.examInstance.create({
            data: {
                examId: exam.id,
                startsAt: istMidnight(spec.dates[0]),
                endsAt: istAt(spec.dates[spec.dates.length - 1], 23 * 60 + 59),
                slotLeadDays: 0,
                slotHorizonDays: 56,
                slotDayPreference: [0, 1, 2, 3, 4, 5, 6],
            },
        });
        for (const day of spec.dates) {
            await p.examScheduleDate.create({
                data: { examInstanceId: instance.id, date: istMidnight(day), priority: 1, isActive: true },
            });
        }
        const timings = [];
        for (let t = 0; t < 4; t += 1) {
            const start = 660 + t * 60; // 11:00, 12:00, 13:00, 14:00 IST
            timings.push(await p.slotTiming.create({
                data: {
                    examInstanceId: instance.id,
                    label: `${hourLabel(start)} – ${hourLabel(start + 60)} IST`,
                    startMinute: start,
                    endMinute: start + 60,
                    capacity: 1,
                    priority: 1,
                    sortOrder: t,
                    weekdays: [0, 1, 2, 3, 4, 5, 6],
                },
            }));
        }
        let slotCount = 0;
        for (const day of spec.dates) {
            for (const timing of timings) {
                await p.examSlot.create({
                    data: {
                        examInstanceId: instance.id,
                        timingId: timing.id,
                        slotDate: istMidnight(day),
                        label: `${timing.label} · ${day} Sep`,
                        startsAt: istAt(day, timing.startMinute),
                        endsAt: istAt(day, timing.endMinute),
                        capacity: 1,
                    },
                });
                slotCount += 1;
            }
        }
        console.log(`created: ${spec.title} — ${slotCount} sittings, capacity 1 each`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
