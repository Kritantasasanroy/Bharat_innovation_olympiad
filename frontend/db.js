const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const user = await prisma.user.findFirst({ where: { firstName: 'Kritanta' } });
    console.log("Email:", user?.email);
    console.log("ID:", user?.id);

    const exam = await prisma.exam.findFirst({ where: { title: 'twst' }, include: { instances: true } });
    if (exam && exam.instances.length > 0) {
        console.log("twst instanceId:", exam.instances[0].id);
    }
    await prisma.$disconnect();
}

run();
