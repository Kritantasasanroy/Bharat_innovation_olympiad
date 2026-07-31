// One-off: issue a roll number to every existing student who has none.
//
// New registrations get one at /auth/sync, but every account created before
// `User.rollNumber` existed is NULL and would otherwise show a blank on the
// dashboard and admit card. Safe to re-run: students that already have a number
// are skipped, so it never reissues or renumbers anyone.
//
// Ordered by createdAt so the earliest registrants get the lowest numbers —
// the order a human would expect if they ever read the list.
//
// Usage (from backend/):
//   node scripts/backfill-roll-numbers.js            # apply
//   node scripts/backfill-roll-numbers.js --dry-run  # report only

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const SEQUENCE_DIGITS = 5;

/** Mirrors src/user/roll-number.ts — kept in step by roll-number.spec.ts. */
function twoDigitYear(year) {
    return String(((Math.trunc(Math.abs(year)) % 100) + 100) % 100).padStart(2, '0');
}
function sequenceKeyFor(seasonYear, grade) {
    return `roll:${twoDigitYear(seasonYear)}:G${grade}`;
}
function formatRollNumber(seasonYear, grade, sequence) {
    return `BIO${twoDigitYear(seasonYear)}-G${grade}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

/** Same atomic claim the service uses, so the counter stays consistent. */
async function claimNext(key) {
    const rows = await prisma.$queryRaw`
        INSERT INTO "Sequence" ("key", "next", "updatedAt")
        VALUES (${key}, 2, NOW())
        ON CONFLICT ("key") DO UPDATE
            SET "next" = "Sequence"."next" + 1, "updatedAt" = NOW()
        RETURNING "Sequence"."next" - 1 AS "next"
    `;
    return Number(rows[0].next);
}

async function main() {
    const seasonYear = Number(process.env.OLYMPIAD_SEASON_YEAR) || new Date().getFullYear();
    console.log(`Season ${seasonYear}${DRY_RUN ? '  (DRY RUN — nothing will be written)' : ''}\n`);

    const students = await prisma.user.findMany({
        where: { role: 'STUDENT', rollNumber: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, classBand: true, createdAt: true },
    });

    if (students.length === 0) {
        console.log('Every student already has a roll number — nothing to do.');
        return;
    }

    // A roll number embeds the grade, so a student with no classBand cannot be
    // given one. Report them rather than inventing a grade.
    const skipped = students.filter((s) => s.classBand === null || s.classBand === undefined);
    const eligible = students.filter((s) => s.classBand !== null && s.classBand !== undefined);

    console.log(`${students.length} student(s) without a roll number`);
    console.log(`  ${eligible.length} eligible, ${skipped.length} missing classBand\n`);

    let issued = 0;
    for (const student of eligible) {
        const sequence = DRY_RUN
            ? 0
            : await claimNext(sequenceKeyFor(seasonYear, student.classBand));
        const rollNumber = DRY_RUN
            ? `BIO${twoDigitYear(seasonYear)}-G${student.classBand}-(next)`
            : formatRollNumber(seasonYear, student.classBand, sequence);

        if (!DRY_RUN) {
            await prisma.user.update({ where: { id: student.id }, data: { rollNumber } });
        }
        issued += 1;
        console.log(`  ${rollNumber}  ${student.email}`);
    }

    if (skipped.length) {
        console.log(`\nSkipped — no classBand, so no grade to embed:`);
        for (const s of skipped) console.log(`  ${s.email}`);
        console.log('Set their class, then re-run this script.');
    }

    console.log(`\n${DRY_RUN ? 'Would issue' : 'Issued'} ${issued} roll number(s).`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
