const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const byClass = await p.user.groupBy({
        by: ['classBand'],
        where: { role: 'STUDENT' },
        _count: { _all: true },
    });
    console.log('all students by class:', JSON.stringify(byClass, null, 1));
    await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
