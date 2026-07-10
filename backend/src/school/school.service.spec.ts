import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { generateAccessToken } from '../common/access-token';
import { SchoolService } from './school.service';

/**
 * In-memory fake of the Prisma slice this service touches. Rows really mutate,
 * so the tests below can assert the things that actually matter — that a token
 * resolves to exactly one school, that revoking deactivates the coordinator —
 * rather than that a mock was called.
 *
 * `findUnique` matches on every key in `where`, which is how the unique indexes
 * on `coordinatorEmail` and `accessTokenHash` behave.
 */
function createFakeDb() {
    let seq = 0;
    const nextId = (prefix: string) => `${prefix}-${++seq}`;

    const schoolRequests: any[] = [];
    const schools: any[] = [];
    const users: any[] = [];
    const auditLogs: any[] = [];

    const match = (row: any, where: any) => Object.keys(where).every((k) => row[k] === where[k]);

    const hydrate = (row: any, include?: any) =>
        row && include?.school
            ? { ...row, school: schools.find((s) => s.id === row.schoolId) ?? null }
            : row;

    const prisma: any = {
        schoolRequest: {
            findUnique: async ({ where, include }: any) =>
                hydrate(schoolRequests.find((r) => match(r, where)) ?? null, include),
            findMany: async () => [...schoolRequests],
            create: async ({ data }: any) => {
                const row = { id: nextId('req'), schoolId: null, coordinatorUserId: null, ...data };
                schoolRequests.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = schoolRequests.find((r) => match(r, where));
                Object.assign(row, data);
                return row;
            },
        },
        school: {
            findUnique: async ({ where }: any) => schools.find((s) => match(s, where)) ?? null,
            create: async ({ data }: any) => {
                const row = { id: nextId('school'), ...data };
                schools.push(row);
                return row;
            },
        },
        user: {
            findUnique: async ({ where }: any) => users.find((u) => match(u, where)) ?? null,
            create: async ({ data }: any) => {
                const row = { id: nextId('user'), ...data };
                users.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = users.find((u) => match(u, where));
                Object.assign(row, data);
                return row;
            },
        },
        auditLog: { create: async ({ data }: any) => auditLogs.push(data) },
        $transaction: async (fn: any) => fn(prisma),
    };

    return { prisma, schoolRequests, schools, users, auditLogs };
}

const jwt: any = { sign: (payload: any) => `jwt.${Buffer.from(JSON.stringify(payload)).toString('base64url')}` };

const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

const APPLICATION = {
    schoolName: 'Delhi Public School, Sector 12',
    board: 'CBSE',
    udiseCode: '07010100112',
    city: 'New Delhi',
    state: 'Delhi',
    coordinatorName: 'Anita Rao',
    coordinatorEmail: 'Anita.Rao@dps.example',
    coordinatorPhone: '+919812345678',
};

function setup() {
    const db = createFakeDb();
    return { ...db, service: new SchoolService(db.prisma, jwt) };
}

/**
 * Apply -> approve, returning the plaintext token from the handover card.
 * Selects the request by coordinator email rather than by position: the fake's
 * `findMany` does not honour `orderBy`, and two calls must not collapse onto
 * the same row (which would quietly defeat the one-token-one-school test).
 */
async function approved(service: SchoolService, overrides: Partial<typeof APPLICATION> = {}) {
    const application = { ...APPLICATION, ...overrides };
    await service.apply(application as any);

    const requests = await service.list();
    const request = requests.find(
        (r) => r.coordinatorEmail === application.coordinatorEmail.toLowerCase(),
    );
    if (!request) throw new Error('test setup: applied request not found');

    await service.decide(request.id, { decision: 'APPROVED', reason: 'Verified' } as any, 'admin-1');
    const card = await service.card(request.id);
    return { requestId: request.id, token: card.accessToken as string, card };
}

describe('apply', () => {
    it('records a PENDING request and nothing else', async () => {
        const { service, schoolRequests, schools, users } = setup();

        const result = await service.apply(APPLICATION as any);

        expect(result.status).toBe('PENDING');
        expect(schoolRequests).toHaveLength(1);
        // Approval is what provisions these; applying must not.
        expect(schools).toHaveLength(0);
        expect(users).toHaveLength(0);
    });

    it('lower-cases the coordinator email so a re-apply is caught', async () => {
        const { service } = setup();
        await service.apply(APPLICATION as any);

        await expect(
            service.apply({ ...APPLICATION, coordinatorEmail: 'anita.rao@dps.example' } as any),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an email that already has a BIO account, rather than hijacking it', async () => {
        const { service, prisma } = setup();
        await prisma.user.create({
            data: { email: 'anita.rao@dps.example', role: 'STUDENT', firstName: 'A', lastName: 'R' },
        });

        await expect(service.apply(APPLICATION as any)).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('decide — approval', () => {
    it('provisions the school, an active SCHOOL coordinator, and one token', async () => {
        const { service, schools, users } = setup();

        const { card } = await approved(service);

        expect(schools).toHaveLength(1);
        expect(schools[0].code).toMatch(/^SCH-[0-9A-HJKMNP-TV-Z]{6}$/);
        expect(schools[0].board).toBe('CBSE');

        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({
            email: 'anita.rao@dps.example',
            firstName: 'Anita',
            lastName: 'Rao',
            role: 'SCHOOL',
            isActive: true,
            schoolId: schools[0].id,
        });

        expect(card.accessToken).toMatch(/^BIO-SCH-/);
        expect(card.schoolCode).toBe(schools[0].code);
    });

    it('never stores the token in the clear', async () => {
        const { service, schoolRequests } = setup();
        const { token } = await approved(service);

        const row = schoolRequests[0];
        expect(row.accessTokenHash).not.toContain(token);
        expect(row.accessTokenSealed).not.toContain(token);
        expect(JSON.stringify(row)).not.toContain(token);
    });

    it('does not re-provision or re-issue on a second approval', async () => {
        const { service, schools, users } = setup();
        const { requestId, token } = await approved(service);

        await service.decide(requestId, { decision: 'APPROVED', reason: 'again' } as any, 'admin-1');

        expect(schools).toHaveLength(1);
        expect(users).toHaveLength(1);
        expect((await service.card(requestId)).accessToken).toBe(token);
    });

    it('rejecting an unprovisioned request creates no school or user', async () => {
        const { service, schools, users } = setup();
        await service.apply(APPLICATION as any);
        const [request] = await service.list();

        await service.decide(request.id, { decision: 'REJECTED', reason: 'Duplicate' } as any, 'a');

        expect(schools).toHaveLength(0);
        expect(users).toHaveLength(0);
    });
});

describe('login', () => {
    it('signs in the approved school the token belongs to', async () => {
        const { service, schools, users } = setup();
        const { token } = await approved(service);

        const result = await service.login({ accessToken: token } as any);

        expect(result.school.id).toBe(schools[0].id);
        expect(decode(result.accessToken)).toMatchObject({
            sub: users[0].id,
            role: 'SCHOOL',
            schoolId: schools[0].id,
        });
    });

    it('accepts a token retyped from a printed card (case and spacing)', async () => {
        const { service } = setup();
        const { token } = await approved(service);

        await expect(
            service.login({ accessToken: `  ${token.toLowerCase()} ` } as any),
        ).resolves.toBeDefined();
    });

    it('binds a token to exactly one school — it cannot sign another one in', async () => {
        const { service, schools } = setup();
        const a = await approved(service);
        const b = await approved(service, {
            schoolName: 'St. Xavier',
            coordinatorEmail: 'head@xavier.example',
        });

        expect(a.token).not.toBe(b.token);
        expect(schools).toHaveLength(2);

        const asA = await service.login({ accessToken: a.token } as any);
        const asB = await service.login({ accessToken: b.token } as any);

        expect(asA.school.id).not.toBe(asB.school.id);
        expect(asA.school.name).toBe('Delhi Public School, Sector 12');
        expect(asB.school.name).toBe('St. Xavier');
    });

    it('refuses a token that was never issued', async () => {
        const { service } = setup();
        await approved(service);

        await expect(
            service.login({ accessToken: generateAccessToken('SCHOOL') } as any),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a partner token, and a JWT', async () => {
        const { service } = setup();
        await expect(
            service.login({ accessToken: generateAccessToken('PARTNER') } as any),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(
            service.login({ accessToken: 'eyJhbGciOi.eyJzdWIi.sig' } as any),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('records when the token was last used', async () => {
        const { service, schoolRequests } = setup();
        const { token } = await approved(service);
        expect(schoolRequests[0].tokenLastUsedAt).toBeUndefined();

        await service.login({ accessToken: token } as any);

        expect(schoolRequests[0].tokenLastUsedAt).toBeInstanceOf(Date);
    });
});

describe('decide — revoke and re-grant', () => {
    it('refuses login and deactivates the coordinator', async () => {
        const { service, users } = setup();
        const { requestId, token } = await approved(service);

        await service.decide(requestId, { decision: 'REVOKED', reason: 'Contract ended' } as any, 'a');

        // Deactivation is what kills a still-valid JWT on its next request.
        expect(users[0].isActive).toBe(false);
        await expect(service.login({ accessToken: token } as any)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it('re-granting restores access with the same token', async () => {
        const { service, users } = setup();
        const { requestId, token } = await approved(service);
        await service.decide(requestId, { decision: 'REVOKED', reason: 'pause' } as any, 'a');

        await service.decide(requestId, { decision: 'APPROVED', reason: 'resumed' } as any, 'a');

        expect(users[0].isActive).toBe(true);
        await expect(service.login({ accessToken: token } as any)).resolves.toBeDefined();
    });
});

describe('card and rotateToken', () => {
    it('exists only for an approved school', async () => {
        const { service } = setup();
        await service.apply(APPLICATION as any);
        const [request] = await service.list();

        await expect(service.card(request.id)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.rotateToken(request.id, 'a')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('carries every detail the school needs to get in', async () => {
        const { service } = setup();
        const { card } = await approved(service);

        expect(card).toMatchObject({
            kind: 'SCHOOL',
            schoolName: 'Delhi Public School, Sector 12',
            board: 'CBSE',
            udiseCode: '07010100112',
            city: 'New Delhi',
            state: 'Delhi',
            coordinatorName: 'Anita Rao',
            coordinatorEmail: 'anita.rao@dps.example',
            coordinatorPhone: '+919812345678',
            status: 'APPROVED',
        });
        expect(card.portalUrl).toContain('http');
        expect(card.tokenIssuedAt).toBeInstanceOf(Date);
    });

    it('rotation invalidates the old token immediately and the new one works', async () => {
        const { service } = setup();
        const { requestId, token: old } = await approved(service);

        const rotated = await service.rotateToken(requestId, 'admin-1');

        expect(rotated.accessToken).not.toBe(old);
        await expect(service.login({ accessToken: old } as any)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        await expect(
            service.login({ accessToken: rotated.accessToken as string } as any),
        ).resolves.toBeDefined();
    });

    it('audits every decision and rotation', async () => {
        const { service, auditLogs } = setup();
        const { requestId } = await approved(service);
        await service.rotateToken(requestId, 'admin-1');

        expect(auditLogs.map((l) => l.action)).toEqual(['school.approved', 'school.token.rotated']);
    });
});
