/**
 * Deletes all STUDENT accounts in class 8 and class 11, with every dependent
 * row cascading (attempts, bookings, slots' bookings, identification, face
 * enrollment, XP, ledgers, payments links). Explicitly requested cleanup.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const where = { role: 'STUDENT', classBand: { in: [8, 11] } };
    const before = await p.user.findMany({
        where,
        select: { id: true, email: true, classBand: true, activatedAt: true },
    });
    console.log(`deleting ${before.length} students:`);
    for (const u of before) console.log(`  - ${u.email} (class ${u.classBand})`);

    const result = await p.user.deleteMany({ where });
    console.log(`deleted: ${before.length} users requested, ${result.count} removed`);

    const remaining = await p.user.count({ where: { role: 'STUDENT', classBand: { in: [8, 11] } } });
    console.log('remaining class 8/11 students:', remaining);
    await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
