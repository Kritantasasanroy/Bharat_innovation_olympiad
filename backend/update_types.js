const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.$executeRawUnsafe(`UPDATE "Question" SET type = 'MCQ' WHERE type IN ('MULTI_SELECT', 'TRUE_FALSE')`);
    console.log("Updated Question types successfully.");
}

main().catch(console.error).finally(()=>prisma.$disconnect());
