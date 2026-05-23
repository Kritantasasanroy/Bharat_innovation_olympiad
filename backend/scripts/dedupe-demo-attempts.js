// One-off: collapse duplicate attempts of the demo exam down to a single
// row per student (the most-recent one), so the result list stops showing
// the same exam multiple times. Safe to re-run.
//
// Usage (from backend/):  node scripts/dedupe-demo-attempts.js

const { PrismaClient } = require('@prisma/client');

const DEMO_EXAM_IDS = [
    '0b95a4e0-66a6-4104-aa44-0c1c314f2fab', // Bio test 1, 22nd may
];

const prisma = new PrismaClient();

async function main() {
    for (const examId of DEMO_EXAM_IDS) {
        const attempts = await prisma.attempt.findMany({
            where: { examInstance: { examId } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, userId: true, examInstanceId: true, status: true, createdAt: true },
        });

        const byUser = new Map();
        for (const a of attempts) {
            if (!byUser.has(a.userId)) byUser.set(a.userId, []);
            byUser.get(a.userId).push(a);
        }

        const toDelete = [];
        for (const [userId, list] of byUser) {
            if (list.length <= 1) continue;
            // Keep index 0 (most recent), delete the rest
            toDelete.push(...list.slice(1).map(a => a.id));
            console.log(`user=${userId} kept=${list[0].id} dropped=${list.length - 1}`);
        }

        if (toDelete.length) {
            const result = await prisma.attempt.deleteMany({
                where: { id: { in: toDelete } },
            });
            console.log(`examId=${examId} → deleted ${result.count} duplicate attempt(s)`);
        } else {
            console.log(`examId=${examId} → no duplicates found`);
        }
    }
}

main()
    .catch(err => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
