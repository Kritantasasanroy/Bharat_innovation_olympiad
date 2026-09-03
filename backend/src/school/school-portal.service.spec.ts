import { BadRequestException } from '@nestjs/common';
import { SchoolPortalService } from './school-portal.service';

function createFakeDb() {
    let seq = 0;
    const users: any[] = [];
    const schools: any[] = [
        { id: 'school-1', name: 'Bright Future', code: 'SCH-ABCDEF', city: 'Nagpur', state: 'Maharashtra', pincode: '441108', board: 'CBSE', udiseCode: null, onboardedAt: new Date('2026-07-01') },
    ];

    const matchesUserWhere = (u: any, where: any) => {
        if (where.schoolId && u.schoolId !== where.schoolId) return false;
        if (where.role && u.role !== where.role) return false;
        return true;
    };

    const prisma: any = {
        school: {
            findUnique: async ({ where }: any) => {
                const row = schools.find((s) => s.id === where.id);
                return row ? { ...row, accessRequest: row.accessRequest ?? null } : null;
            },
        },
        user: {
            findUnique: async ({ where }: any) => users.find((u) => u.email === where.email) ?? null,
            findMany: async ({ where }: any) => users.filter((u) => matchesUserWhere(u, where)),
            create: async ({ data }: any) => {
                const row = { id: `user-${++seq}`, payments: [], attempts: [], activatedAt: null, ...data };
                users.push(row);
                return row;
            },
        },
        attempt: { findMany: async () => [] },
    };
    return { prisma, users, schools };
}

function setup() {
    const db = createFakeDb();
    // The collaborators added for the partner card and result export are not
    // exercised by these roster/read tests, so they are stubbed to nothing rather
    // than faked — a fake would only assert against itself here.
    return {
        ...db,
        service: new SchoolPortalService(
            db.prisma as never,
            {} as never, // PartnerDirectoryService
            {} as never, // ResultsExportService
            {} as never, // PartnerAdminApiClient
        ),
    };
}

const roster = (students: { name: string; email: string; classBand: number }[]) => ({ students });

describe('registerStudents — the only write a school gets', () => {
    it('adds students to its own roster, marked invited and not yet activated', async () => {
        const { service, users } = setup();

        const result = await service.registerStudents(
            'school-1',
            roster([{ name: 'Aarav Sharma', email: 'Aarav@example.test', classBand: 8 }]),
        );

        expect(result.added).toBe(1);
        expect(users[0]).toMatchObject({
            email: 'aarav@example.test',
            firstName: 'Aarav',
            lastName: 'Sharma',
            role: 'STUDENT',
            classBand: 8,
            schoolId: 'school-1',
            activatedAt: null,
        });
        expect(users[0].invitedAt).toBeInstanceOf(Date);
    });

    it('never seizes an account that already exists on the platform', async () => {
        const { service, prisma, users } = setup();
        await prisma.user.create({
            data: { email: 'taken@example.test', role: 'STUDENT', firstName: 'A', lastName: 'B', schoolId: 'other-school' },
        });

        const result = await service.registerStudents(
            'school-1',
            roster([{ name: 'Impostor', email: 'taken@example.test', classBand: 8 }]),
        );

        expect(result.added).toBe(0);
        expect(result.skipped).toEqual([
            { email: 'taken@example.test', reason: 'Already registered on the platform.' },
        ]);
        // The victim's school is untouched.
        expect(users[0].schoolId).toBe('other-school');
    });

    it('reports a student already on this roster distinctly', async () => {
        const { service } = setup();
        await service.registerStudents('school-1', roster([{ name: 'A B', email: 'a@x.test', classBand: 8 }]));

        const again = await service.registerStudents(
            'school-1',
            roster([{ name: 'A B', email: 'A@X.test', classBand: 8 }]),
        );

        expect(again.skipped[0]).toEqual({ email: 'a@x.test', reason: 'Already on your roster.' });
    });

    it('catches a duplicate inside one bulk upload', async () => {
        const { service, users } = setup();

        const result = await service.registerStudents(
            'school-1',
            roster([
                { name: 'A B', email: 'dup@x.test', classBand: 8 },
                { name: 'A B', email: 'DUP@x.test', classBand: 8 },
            ]),
        );

        expect(result.added).toBe(1);
        expect(users).toHaveLength(1);
        expect(result.skipped[0].reason).toBe('Duplicated in this upload.');
    });

    it('adds the good rows even when some are rejected', async () => {
        const { service } = setup();

        const result = await service.registerStudents(
            'school-1',
            roster([
                { name: 'Good One', email: 'good@x.test', classBand: 8 },
                { name: 'Dupe', email: 'good@x.test', classBand: 8 },
                { name: 'Good Two', email: 'good2@x.test', classBand: 9 },
            ]),
        );

        expect(result.added).toBe(2);
        expect(result.skipped).toHaveLength(1);
    });

    it('refuses an empty roster', async () => {
        const { service } = setup();
        await expect(service.registerStudents('school-1', roster([]))).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});

describe('students and overview', () => {
    const withAttempt = (status: string) => [{ status, totalScore: 42 }];

    it('reads a student’s furthest milestone', async () => {
        const { service, prisma } = setup();
        const base = { role: 'STUDENT', schoolId: 'school-1', firstName: 'A', lastName: 'B', classBand: 8 };
        await prisma.user.create({ data: { ...base, email: 'invited@x.test', invitedAt: new Date() } });
        await prisma.user.create({ data: { ...base, email: 'reg@x.test', activatedAt: new Date() } });
        await prisma.user.create({ data: { ...base, email: 'paid@x.test', activatedAt: new Date(), payments: [{ id: 'p1' }] } });
        await prisma.user.create({ data: { ...base, email: 'done@x.test', activatedAt: new Date(), attempts: withAttempt('SUBMITTED') } });

        const rows = await service.students('school-1');
        const statusOf = (email: string) => rows.find((r) => r.email === email)?.status;

        expect(statusOf('invited@x.test')).toBe('INVITED');
        expect(statusOf('reg@x.test')).toBe('REGISTERED');
        expect(statusOf('paid@x.test')).toBe('PAID');
        expect(statusOf('done@x.test')).toBe('COMPLETED');
    });

    it('counts an auto-submitted attempt as completed', async () => {
        const { service, prisma } = setup();
        await prisma.user.create({
            data: {
                role: 'STUDENT', schoolId: 'school-1', email: 'auto@x.test', firstName: 'A', lastName: 'B',
                classBand: 8, activatedAt: new Date(), attempts: withAttempt('AUTO_SUBMITTED'),
            },
        });

        // A student whose time ran out finished the exam just as much as one who
        // pressed submit; counting only SUBMITTED under-reports every school.
        expect((await service.students('school-1'))[0].status).toBe('COMPLETED');
        expect(await service.overview('school-1')).toMatchObject({ completed: 1, paid: 1 });
    });

    it('rolls milestones up, so paid counts those who finished too', async () => {
        const { service, prisma } = setup();
        const base = { role: 'STUDENT', schoolId: 'school-1', firstName: 'A', lastName: 'B', classBand: 8 };
        await prisma.user.create({ data: { ...base, email: 'i@x.test', invitedAt: new Date() } });
        await prisma.user.create({ data: { ...base, email: 'r@x.test', activatedAt: new Date() } });
        await prisma.user.create({ data: { ...base, email: 'd@x.test', activatedAt: new Date(), attempts: withAttempt('SUBMITTED') } });

        expect(await service.overview('school-1')).toEqual({
            invited: 3,
            registered: 2,
            paid: 1,
            completed: 1,
        });
    });

    it('only ever reads its own school', async () => {
        const { service, prisma } = setup();
        await prisma.user.create({
            data: { role: 'STUDENT', schoolId: 'other-school', email: 'x@x.test', firstName: 'A', lastName: 'B', classBand: 8 },
        });

        expect(await service.students('school-1')).toHaveLength(0);
    });
});

describe('profile', () => {
    it('is built from the details filled in when requesting access', async () => {
        const { service, schools } = setup();
        schools[0].accessRequest = {
            coordinatorName: 'Anita Rao',
            coordinatorEmail: 'anita@x.test',
            coordinatorPhone: '+919812345678',
        };

        const profile = await service.profile('school-1');

        expect(profile).toMatchObject({
            name: 'Bright Future',
            code: 'SCH-ABCDEF',
            board: 'CBSE',
            city: 'Nagpur',
            pincode: '441108',
            status: 'ACTIVE',
            coordinator: { name: 'Anita Rao', email: 'anita@x.test' },
        });
    });

    it('advertises which fields the coordinator may edit — and which it may not', async () => {
        const { service } = setup();

        const profile = await service.profile('school-1');

        // A school owns its contact details (item 14)...
        expect(profile.editable).toEqual(
            expect.arrayContaining(['board', 'coordinatorName', 'coordinatorPhone']),
        );
        // ...but never its identity. `(nameKey, pincode)` is the directory's
        // uniqueness key and `code` is what students type at registration; a
        // coordinator rewriting either would collide with another school or break
        // every student already pointing at this one.
        expect(profile.editable).not.toContain('name');
        expect(profile.editable).not.toContain('pincode');
        expect(profile.editable).not.toContain('code');
        expect(profile.editable).not.toContain('coordinatorEmail');
    });
});
