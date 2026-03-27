const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    const adminId = 'Admin@bio123.com';
    const password = 'Admin@bio123';

    console.log(`Seeding Admin user: ${adminId}`);

    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminId }
    });

    if (existingAdmin) {
        console.log('Admin already exists! Updating password...');
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { email: adminId },
            data: { passwordHash }
        });
        console.log('Admin password updated successfully.');
    } else {
        console.log('Creating new Admin user...');
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                email: adminId,
                passwordHash,
                firstName: 'Platform',
                lastName: 'Admin',
                role: 'SUPER_ADMIN', 
                isActive: true
            }
        });
        console.log('Admin user created successfully.');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
