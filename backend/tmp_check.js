const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const attempts = await prisma.attempt.findMany({
        include: { examInstance: { include: { exam: true } }, user: true }
    });
    console.log(JSON.stringify(attempts, null, 2));
}
main().finally(() => prisma.$disconnect());
