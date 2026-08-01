// Turn the slot requirement on or off for one exam, and optionally extend its
// window so "available all the time" is actually true.
//
// An exam with requiresSlot=false is startable at any point inside its instance
// window with no booking. Slots and existing bookings are left untouched, so
// turning it back on restores the timetable exactly as it was.
//
// The same toggle is on the admin Exams page ("Allow any time (no slot)"); this
// script exists because extending the window is not exposed there.
//
// Usage (from backend/):
//   node scripts/set-slot-requirement.js --list
//   node scripts/set-slot-requirement.js --exam <id> --no-slot [--until 2026-12-31]
//   node scripts/set-slot-requirement.js --exam <id> --require-slot

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

async function list() {
    const exams = await prisma.exam.findMany({
        where: { isArchived: false },
        select: {
            id: true, title: true, isPublished: true, requiresSlot: true,
            instances: { select: { startsAt: true, endsAt: true, _count: { select: { slots: true } } } },
        },
        orderBy: { createdAt: 'desc' },
    });
    for (const e of exams) {
        const slotState = e.requiresSlot ? 'slot REQUIRED' : 'ANY TIME (no slot)';
        console.log(`\n${e.title}`);
        console.log(`  ${e.id}`);
        console.log(`  published=${e.isPublished}  ${slotState}`);
        for (const i of e.instances) {
            console.log(
                `  window ${i.startsAt.toISOString().slice(0, 16)} → ${i.endsAt.toISOString().slice(0, 16)}  (${i._count.slots} slots)`,
            );
        }
    }
}

async function main() {
    if (flag('--list') || args.length === 0) return list();

    const examId = value('--exam');
    if (!examId) throw new Error('Pass --exam <id>. Use --list to see the ids.');

    const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: { id: true, title: true, requiresSlot: true, instances: { select: { id: true, endsAt: true } } },
    });
    if (!exam) throw new Error(`No exam with id ${examId}`);

    if (flag('--require-slot')) {
        await prisma.exam.update({ where: { id: examId }, data: { requiresSlot: true } });
        console.log(`"${exam.title}" now REQUIRES a booked slot again.`);
        console.log('Existing slots and bookings were never removed, so the timetable is back as it was.');
        return;
    }

    if (!flag('--no-slot')) throw new Error('Pass --no-slot or --require-slot.');

    await prisma.exam.update({ where: { id: examId }, data: { requiresSlot: false } });
    console.log(`"${exam.title}" can now be sat at ANY TIME inside its window — no slot needed.`);

    const until = value('--until');
    if (until) {
        // An exam whose window closes tomorrow is not "available all the time",
        // so the window usually has to move as well.
        const endsAt = new Date(`${until}T23:59:00.000Z`);
        if (Number.isNaN(endsAt.getTime())) throw new Error(`--until must be YYYY-MM-DD, got "${until}"`);

        for (const instance of exam.instances) {
            await prisma.examInstance.update({ where: { id: instance.id }, data: { endsAt } });
            console.log(
                `  window extended: ${instance.endsAt.toISOString().slice(0, 16)} → ${endsAt.toISOString().slice(0, 16)}`,
            );
        }
        console.log(
            '\n⚠️  Results cannot be released while an exam window is still open.\n' +
                '   When you are ready to publish results, shorten the window (admin → Edit Schedule)\n' +
                '   or re-run this script with an --until date in the past.',
        );
    }
}

main()
    .catch((err) => {
        console.error(err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
