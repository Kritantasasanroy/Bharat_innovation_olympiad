const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const schoolsPath = path.join(__dirname, '..', 'frontend', 'src', 'data', 'schools.json');
    if (!fs.existsSync(schoolsPath)) {
        console.error('Schools JSON not found at', schoolsPath);
        return;
    }

    const schoolsData = JSON.parse(fs.readFileSync(schoolsPath, 'utf-8'));
    console.log(`Loaded ${schoolsData.length} schools from JSON.`);

    let added = 0;
    for (const school of schoolsData) {
        // We use Pincode + Sr. as the code if it doesn't have one, or just Sr. as code?
        // Let's use the 'Sr.' padded with zeros as the code, e.g. "SCH001"
        const code = `SCH${String(school['Sr.']).padStart(3, '0')}`;
        const name = school['School Name'];
        const city = school['Address']; // Storing address in city for now
        const state = 'Maharashtra'; // Default since they look like Nagpur schools

        try {
            await prisma.school.upsert({
                where: { code },
                update: { name, city, state },
                create: { code, name, city, state }
            });
            added++;
        } catch (e) {
            console.error(`Failed to add school: ${name}`, e);
        }
    }

    console.log(`Successfully added/updated ${added} schools.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
