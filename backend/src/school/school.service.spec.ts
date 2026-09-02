import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { issueActivationTicket } from '../common/activation-ticket';
import { generateAccessToken } from '../common/access-token';
import type { EmailOtpService } from '../common/email-otp.service';
import { notificationServiceStub } from '../notification/notification.stub';
import type { ApplySchoolDto, DecideSchoolDto, SchoolLoginDto } from './dto/school.dto';
import { schoolNameKey } from './school-directory.helpers';
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
type StoreArgs = {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
    include?: Record<string, unknown>;
    select?: Record<string, unknown>;
    orderBy?: unknown;
};

type SchoolRow = {
    id: string;
    name: string;
    nameKey: string;
    code: string;
    city: string;
    state: string;
    pincode: string;
    board: string | null | undefined;
    udiseCode: string | null | undefined;
    partnerId: string | null | undefined;
    onboardedAt: Date | null | undefined;
};

type SchoolRequestRow = {
    id: string;
    schoolName: string;
    board: string;
    udiseCode: string | null;
    pincode: string;
    city: string;
    state: string;
    coordinatorName: string;
    coordinatorEmail: string;
    coordinatorPhone: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
    passwordHash: string | null;
    emailVerifiedAt: Date | null;
    emailVerificationTokenHash: string | null;
    emailVerificationTokenExpiresAt: Date | null;
    emailVerificationSentAt: Date | null;
    emailVerificationTokenUsedAt: Date | null;
    submittedByPartnerId: string | null;
    submittedViaReferralCode: string | null;
    schoolId: string | null;
    coordinatorUserId: string | null;
    accessTokenHash: string | null;
    accessTokenSealed: string | null;
    tokenIssuedAt: Date | null;
    tokenLastUsedAt: Date | null;
    decisionReason: string | null;
    decidedBy: string | null;
    decidedAt: Date | null;
    createdAt: Date;
    school?: SchoolRow | null;
};

type UserRow = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    schoolId: string | null | undefined;
    isActive: boolean;
};

type AuditRow = Record<string, unknown>;

type FakePrisma = {
    schoolRequest: {
        findFirst(args: StoreArgs): Promise<SchoolRequestRow | null>;
        findUnique(args: StoreArgs): Promise<SchoolRequestRow | null>;
        findMany(args?: StoreArgs): Promise<readonly SchoolRequestRow[]>;
        create(args: StoreArgs): Promise<SchoolRequestRow>;
        update(args: StoreArgs): Promise<SchoolRequestRow>;
        updateMany(args: StoreArgs): Promise<{ count: number }>;
    };
    school: {
        findUnique(args: StoreArgs): Promise<SchoolRow | null>;
        create(args: StoreArgs): Promise<SchoolRow>;
        update(args: StoreArgs): Promise<SchoolRow>;
    };
    user: {
        findFirst(args: StoreArgs): Promise<UserRow | null>;
        findUnique(args: StoreArgs): Promise<UserRow | null>;
        create(args: StoreArgs): Promise<UserRow>;
        update(args: StoreArgs): Promise<UserRow>;
    };
    auditLog: { create(args: StoreArgs): Promise<unknown> };
    $transaction<T>(callback: (tx: FakePrisma) => Promise<T>): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function stringValue(data: Record<string, unknown>, key: string): string {
    const value = data[key];
    return typeof value === 'string' ? value : '';
}

function nullableStringValue(data: Record<string, unknown>, key: string): string | null {
    const value = data[key];
    return typeof value === 'string' ? value : null;
}

function dateValue(data: Record<string, unknown>, key: string): Date | null {
    const value = data[key];
    return value instanceof Date ? value : null;
}

function statusValue(data: Record<string, unknown>): SchoolRequestRow['status'] {
    const value = data.status;
    if (value === 'APPROVED' || value === 'REJECTED' || value === 'REVOKED') return value;
    return 'PENDING';
}

function booleanValue(data: Record<string, unknown>, key: string, fallback: boolean): boolean {
    return typeof data[key] === 'boolean' ? data[key] : fallback;
}

function valuesEqual(actual: unknown, expected: unknown, mode?: string): boolean {
    if (mode === 'insensitive' && typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase() === expected.toLowerCase();
    }
    return actual === expected;
}

function createFakeDb() {
    let seq = 0;
    const nextId = (prefix: string) => `${prefix}-${++seq}`;

    const schoolRequests: SchoolRequestRow[] = [];
    const schools: SchoolRow[] = [];
    const users: UserRow[] = [];
    const auditLogs: AuditRow[] = [];

    const match = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
        Object.entries(where).every(([key, value]) => {
            if (isRecord(value)) {
                if ('equals' in value) {
                    return valuesEqual(row[key], value.equals, value.mode as string | undefined);
                }
                return Object.entries(value).every(([nestedKey, nestedValue]) => row[nestedKey] === nestedValue);
            }
            return row[key] === value;
        });

    const hydrate = (row: SchoolRequestRow | null, include?: Record<string, unknown>) =>
        row && include?.school
            ? { ...row, school: schools.find((school) => school.id === row.schoolId) ?? null }
            : row;

    const prisma: FakePrisma = {
        schoolRequest: {
            findFirst: async ({ where, include }: StoreArgs) =>
                hydrate(schoolRequests.find((row) => match(row, where)) ?? null, include),
            findUnique: async ({ where, include }: StoreArgs) =>
                hydrate(schoolRequests.find((row) => match(row, where)) ?? null, include),
            findMany: async () => [...schoolRequests],
            create: async ({ data = {} }: StoreArgs) => {
                const row: SchoolRequestRow = {
                    id: nextId('req'),
                    schoolName: stringValue(data, 'schoolName'),
                    board: stringValue(data, 'board'),
                    udiseCode: nullableStringValue(data, 'udiseCode'),
                    pincode: stringValue(data, 'pincode'),
                    city: stringValue(data, 'city'),
                    state: stringValue(data, 'state'),
                    coordinatorName: stringValue(data, 'coordinatorName'),
                    coordinatorEmail: stringValue(data, 'coordinatorEmail'),
                    coordinatorPhone: stringValue(data, 'coordinatorPhone'),
                    status: statusValue(data),
                    passwordHash: nullableStringValue(data, 'passwordHash'),
                    emailVerifiedAt: dateValue(data, 'emailVerifiedAt'),
                    emailVerificationTokenHash: nullableStringValue(data, 'emailVerificationTokenHash'),
                    emailVerificationTokenExpiresAt: dateValue(data, 'emailVerificationTokenExpiresAt'),
                    emailVerificationSentAt: dateValue(data, 'emailVerificationSentAt'),
                    emailVerificationTokenUsedAt: dateValue(data, 'emailVerificationTokenUsedAt'),
                    submittedByPartnerId: nullableStringValue(data, 'submittedByPartnerId'),
                    submittedViaReferralCode: nullableStringValue(data, 'submittedViaReferralCode'),
                    schoolId: nullableStringValue(data, 'schoolId'),
                    coordinatorUserId: nullableStringValue(data, 'coordinatorUserId'),
                    accessTokenHash: nullableStringValue(data, 'accessTokenHash'),
                    accessTokenSealed: nullableStringValue(data, 'accessTokenSealed'),
                    tokenIssuedAt: dateValue(data, 'tokenIssuedAt'),
                    tokenLastUsedAt: dateValue(data, 'tokenLastUsedAt'),
                    decisionReason: nullableStringValue(data, 'decisionReason'),
                    decidedBy: nullableStringValue(data, 'decidedBy'),
                    decidedAt: dateValue(data, 'decidedAt'),
                    createdAt: dateValue(data, 'createdAt') ?? new Date(),
                };
                schoolRequests.push(row);
                return row;
            },
            update: async ({ where = {}, data = {} }: StoreArgs) => {
                const row = schoolRequests.find((candidate) => match(candidate, where));
                if (!row) throw new Error('test fixture row not found');
                Object.assign(row, data);
                return row;
            },
            updateMany: async ({ where = {}, data = {} }: StoreArgs) => {
                const row = schoolRequests.find((candidate) => match(candidate, where));
                if (!row) return { count: 0 };
                Object.assign(row, data);
                return { count: 1 };
            },
        },
        school: {
            findUnique: async ({ where = {} }: StoreArgs) =>
                schools.find((school) => match(school, where)) ?? null,
            create: async ({ data = {} }: StoreArgs) => {
                const row: SchoolRow = {
                    id: nextId('school'),
                    name: stringValue(data, 'name'),
                    nameKey: stringValue(data, 'nameKey'),
                    code: stringValue(data, 'code'),
                    city: stringValue(data, 'city'),
                    state: stringValue(data, 'state'),
                    pincode: stringValue(data, 'pincode'),
                    board: nullableStringValue(data, 'board'),
                    udiseCode: nullableStringValue(data, 'udiseCode'),
                    partnerId: nullableStringValue(data, 'partnerId'),
                    onboardedAt: dateValue(data, 'onboardedAt'),
                };
                schools.push(row);
                return row;
            },
            update: async ({ where = {}, data = {} }: StoreArgs) => {
                const row = schools.find((school) => match(school, where));
                if (!row) throw new Error('test fixture school not found');
                Object.assign(row, data);
                return row;
            },
        },
        user: {
            findFirst: async ({ where = {} }: StoreArgs) => users.find((user) => match(user, where)) ?? null,
            findUnique: async ({ where = {} }: StoreArgs) => users.find((user) => match(user, where)) ?? null,
            create: async ({ data = {} }: StoreArgs) => {
                const row: UserRow = {
                    id: nextId('user'),
                    email: stringValue(data, 'email'),
                    firstName: stringValue(data, 'firstName'),
                    lastName: stringValue(data, 'lastName'),
                    role: stringValue(data, 'role'),
                    schoolId: nullableStringValue(data, 'schoolId'),
                    isActive: booleanValue(data, 'isActive', true),
                };
                users.push(row);
                return row;
            },
            update: async ({ where = {}, data = {} }: StoreArgs) => {
                const row = users.find((user) => match(user, where));
                if (!row) throw new Error('test fixture user not found');
                Object.assign(row, data);
                return row;
            },
        },
        auditLog: {
            create: async ({ data = {} }: StoreArgs) => {
                auditLogs.push(data);
                return data;
            },
        },
        $transaction: async <T>(callback: (tx: FakePrisma) => Promise<T>) => callback(prisma),
    };

    return { prisma, schoolRequests, schools, users, auditLogs };
}

type JwtDouble = { sign(payload: Record<string, unknown>, options?: Record<string, unknown>): string };
const jwt: JwtDouble = {
    sign: (payload) => `jwt.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`,
};

const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());

const APPLICATION: ApplySchoolDto = {
    schoolName: 'Delhi Public School, Sector 12',
    board: 'CBSE',
    udiseCode: '07010100112',
    pincode: '110001',
    city: 'New Delhi',
    state: 'Delhi',
    coordinatorName: 'Anita Rao',
    coordinatorEmail: 'Anita.Rao@dps.example',
    coordinatorPhone: '+919812345678',
    password: 'correct horse battery staple',
};

/** A valid verify-first ticket for a self-applying coordinator's email. */
function ticketFor(email: string): string {
    return issueActivationTicket('SCHOOL', email.trim().toLowerCase());
}

/**
 * Fake engine client. `resolvePartnerIdByReferralCode` is best-effort: the real
 * one returns null for an unknown/inactive code and never throws. Tests can
 * override the resolver per case.
 */
type FakeAdminApi = {
    resolvePartnerIdByReferralCode(code: string): Promise<string | null>;
};

function createFakeAdminApi(
    resolve: (code: string) => Promise<string | null> = async () => null,
): FakeAdminApi {
    return { resolvePartnerIdByReferralCode: jest.fn(resolve) };
}

type FakePartnerDirectory = {
    detailsFor(
        partnerId: string,
        isDefault: boolean,
    ): Promise<{ email: string; contactPerson: string }>;
};

function createFakePartnerDirectory(): FakePartnerDirectory {
    return {
        detailsFor: jest.fn(async (_partnerId: string, _isDefault: boolean) => ({
            email: 'partner@example.com',
            contactPerson: 'Partner Contact',
        })),
    };
}

/**
 * A lightweight double, not a fake table: `EmailOtpService` gets its own
 * dedicated coverage in `common/email-otp.service.spec.ts` (hashing, expiry,
 * attempts, rate limiting). `SchoolService` only needs to be tested on how it
 * interprets that contract — a duplicate/claimed email is still checked
 * before ever calling this, and a valid code hands back the normalised email.
 */
function createFakeEmailOtp() {
    const codes = new Map<string, string>();
    return {
        sendOtp: jest.fn(async (kind: string, email: string) => {
            codes.set(`${kind}:${email.trim().toLowerCase()}`, '123456');
            return { sent: true, expiresInSeconds: 600 };
        }),
        verifyOtp: jest.fn(async (kind: string, email: string, code: string) => {
            const normalized = email.trim().toLowerCase();
            const key = `${kind}:${normalized}`;
            if (codes.get(key) !== code) {
                throw new BadRequestException('This code is invalid or has expired. Request a new one.');
            }
            codes.delete(key);
            return normalized;
        }),
    };
}

function setup(adminApi: FakeAdminApi = createFakeAdminApi()) {
    const db = createFakeDb();
    const notifications = notificationServiceStub();
    const partnerDirectory = createFakePartnerDirectory();
    const emailOtp = createFakeEmailOtp();
    return {
        ...db,
        adminApi,
        notifications,
        partnerDirectory,
        emailOtp,
        service: new SchoolService(
            db.prisma,
            jwt,
            adminApi,
            notifications,
            partnerDirectory,
            emailOtp as unknown as EmailOtpService,
        ),
    };
}

/**
 * Apply -> approve, returning the plaintext token from the handover card.
 * Selects the request by coordinator email rather than by position: the fake's
 * `findMany` does not honour `orderBy`, and two calls must not collapse onto
 * the same row (which would quietly defeat the one-token-one-school test).
 *
 * Goes in via the partner-submitted path (a `submittedByPartnerId` arg) rather
 * than self-apply — this helper only cares about reaching APPROVED with a
 * working token, and self-apply's password/ticket requirements are exercised
 * by their own dedicated tests below.
 */
async function approved(service: SchoolService, overrides: Partial<typeof APPLICATION> = {}) {
    const application: ApplySchoolDto = { ...APPLICATION, ...overrides };
    await service.apply(application, 'test-partner-approved');

    const requests = await service.list();
    const request = requests.find(
        (r) => r.coordinatorEmail === application.coordinatorEmail.toLowerCase(),
    );
    if (!request) throw new Error('test setup: applied request not found');

    request.emailVerifiedAt = new Date();
    await service.decide(request.id, { decision: 'APPROVED', reason: 'Verified' }, 'admin-1');
    const card = await service.card(request.id);
    if (!card.accessToken) throw new Error('test setup: access token missing');
    return { requestId: request.id, token: card.accessToken, card };
}

describe('apply (self-service, verify-first)', () => {
    it('records a verified PENDING request and nothing else', async () => {
        const { service, schoolRequests, schools, users } = setup();

        const result = await service.apply({
            ...APPLICATION,
            verificationTicket: ticketFor(APPLICATION.coordinatorEmail),
        });

        expect(result.status).toBe('PENDING');
        expect(schoolRequests).toHaveLength(1);
        expect(schoolRequests[0].emailVerifiedAt).toBeInstanceOf(Date);
        expect(schoolRequests[0].passwordHash).toBeTruthy();
        // Approval is what provisions these; applying must not.
        expect(schools).toHaveLength(0);
        expect(users).toHaveLength(0);
    });

    it('refuses to submit without a password', async () => {
        const { service } = setup();
        const { password, ...noPassword } = APPLICATION;

        await expect(
            service.apply({ ...noPassword, verificationTicket: ticketFor(APPLICATION.coordinatorEmail) }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to submit without proof the email was verified', async () => {
        const { service } = setup();

        await expect(service.apply(APPLICATION)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a ticket minted for a different email', async () => {
        const { service } = setup();

        await expect(
            service.apply({ ...APPLICATION, verificationTicket: ticketFor('someone-else@example.com') }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lower-cases the coordinator email so a re-apply is caught', async () => {
        const { service } = setup();
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.coordinatorEmail) });

        await expect(
            service.apply({
                ...APPLICATION,
                coordinatorEmail: 'anita.rao@dps.example',
                verificationTicket: ticketFor('anita.rao@dps.example'),
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an email that already has a BIO account, rather than hijacking it', async () => {
        const { service, prisma } = setup();
        await prisma.user.create({
            data: { email: 'anita.rao@dps.example', role: 'STUDENT', firstName: 'A', lastName: 'R' },
        });

        await expect(service.apply(APPLICATION)).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('startVerification + confirmVerification (self-service, verify-first, OTP)', () => {
    it('rejects an email that already has an application, before any details are collected', async () => {
        const { service } = setup();
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.coordinatorEmail) });

        await expect(service.startVerification(APPLICATION.coordinatorEmail)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it('delegates the send to EmailOtpService, scoped to SCHOOL', async () => {
        const { service, emailOtp } = setup();

        await service.startVerification(APPLICATION.coordinatorEmail);

        expect(emailOtp.sendOtp).toHaveBeenCalledWith('SCHOOL', APPLICATION.coordinatorEmail.toLowerCase());
    });

    it('confirming the right code mints a ticket that apply() accepts', async () => {
        const { service } = setup();

        await service.startVerification(APPLICATION.coordinatorEmail);
        const confirmed = await service.confirmVerification(APPLICATION.coordinatorEmail, '123456');

        expect(confirmed.status).toBe('CONTINUE_APPLICATION');
        const result = await service.apply({
            ...APPLICATION,
            verificationTicket: confirmed.submissionTicket,
        });
        expect(result.status).toBe('PENDING');
    });

    it('rejects the wrong code', async () => {
        const { service } = setup();
        await service.startVerification(APPLICATION.coordinatorEmail);

        await expect(
            service.confirmVerification(APPLICATION.coordinatorEmail, '000000'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('email verification (partner-submitted)', () => {
    it('keeps a school out of the approval flow until its email is verified', async () => {
        const { service, schoolRequests, notifications } = setup();

        const result = await service.apply(APPLICATION, 'partner-99');
        const request = schoolRequests[0];
        const token = notifications.sendSchoolEmailVerification.mock.calls[0][1].token;

        expect(result.status).toBe('EMAIL_VERIFICATION_REQUIRED');
        expect(request.emailVerifiedAt).toBeNull();
        expect(request.emailVerificationTokenHash).not.toBe(token);
        await expect(
            service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1'),
        ).rejects.toThrow('has not confirmed their email');
    });

    it('verifies once, sends the review notification, and asks to set a password on every visit', async () => {
        const { service, schoolRequests, notifications } = setup();
        await service.apply(APPLICATION, 'partner-99');
        const token = notifications.sendSchoolEmailVerification.mock.calls[0][1].token;

        const first = await service.verifyEmail(token);
        const second = await service.verifyEmail(token);

        expect(first.status).toBe('SET_PASSWORD');
        expect(second.status).toBe('SET_PASSWORD');
        expect(first.setPasswordTicket).toBeDefined();
        expect(second.setPasswordTicket).toBeDefined();
        expect(schoolRequests[0].emailVerifiedAt).toBeInstanceOf(Date);
        expect(notifications.sendSchoolApplicationReceived).toHaveBeenCalledTimes(1);
    });

    it('a partner-submitted school can set a password and then sign in with email + password', async () => {
        const { service, schoolRequests, notifications } = setup();
        await service.apply(APPLICATION, 'partner-99');
        const token = notifications.sendSchoolEmailVerification.mock.calls[0][1].token;

        const verified = await service.verifyEmail(token);
        expect(verified.status).toBe('SET_PASSWORD');

        const password = 'a brand new password ';
        await expect(
            service.setPassword(APPLICATION.coordinatorEmail, verified.setPasswordTicket!, password),
        ).resolves.toEqual({ status: 'PASSWORD_SET' });

        expect(schoolRequests[0].passwordHash).toBeTruthy();

        await service.decide(schoolRequests[0].id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');

        const result = await service.login({
            coordinatorEmail: APPLICATION.coordinatorEmail,
            password,
        });
        expect(result.school.name).toBe('Delhi Public School, Sector 12');
    });

    it('rejects an expired verification token', async () => {
        const { service, schoolRequests, notifications } = setup();
        await service.apply(APPLICATION, 'partner-99');
        schoolRequests[0].emailVerificationTokenExpiresAt = new Date(Date.now() - 1);
        const token = notifications.sendSchoolEmailVerification.mock.calls[0][1].token;

        await expect(service.verifyEmail(token)).rejects.toThrow('invalid or has expired');
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

        await service.decide(requestId, { decision: 'APPROVED', reason: 'again' }, 'admin-1');

        expect(schools).toHaveLength(1);
        expect(users).toHaveLength(1);
        expect((await service.card(requestId)).accessToken).toBe(token);
    });

    it('adopts a school a student already added, rather than duplicating it', async () => {
        const { service, prisma, schools } = setup();
        // A student could not find their school and added it to the directory:
        // same school, no coordinator, not onboarded.
        await prisma.school.create({
            data: {
                name: 'Delhi Public School Sector 12',
                nameKey: schoolNameKey(APPLICATION.schoolName),
                code: 'SCH-AAAAAA',
                city: 'New Delhi',
                state: 'Delhi',
                pincode: '110001',
                onboardedAt: null,
            },
        });

        const { card } = await approved(service);

        // One row, now onboarded, keeping the code students may already hold.
        expect(schools).toHaveLength(1);
        expect(schools[0].code).toBe('SCH-AAAAAA');
        expect(schools[0].onboardedAt).toBeInstanceOf(Date);
        expect(schools[0].board).toBe('CBSE');
        expect(card.schoolCode).toBe('SCH-AAAAAA');
    });

    it('records the partner that onboarded the school', async () => {
        const { service, schoolRequests } = setup();
        await service.apply(APPLICATION, 'partner-42');

        expect(schoolRequests[0].submittedByPartnerId).toBe('partner-42');
    });

    it('leaves submittedByPartnerId null on a self-application', async () => {
        const { service, schoolRequests } = setup();
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.coordinatorEmail) });

        expect(schoolRequests[0].submittedByPartnerId).toBeNull();
    });

    it('attributes a campaign referral code to its partner', async () => {
        const adminApi = createFakeAdminApi(async (code) =>
            code === 'ref_good' ? 'partner-from-campaign' : null,
        );
        const { service, schoolRequests } = setup(adminApi);

        await service.apply({
            ...APPLICATION,
            referralCode: 'ref_good',
            verificationTicket: ticketFor(APPLICATION.coordinatorEmail),
        });

        expect(adminApi.resolvePartnerIdByReferralCode).toHaveBeenCalledWith('ref_good');
        expect(schoolRequests[0].submittedByPartnerId).toBe('partner-from-campaign');
        expect(schoolRequests[0].submittedViaReferralCode).toBe('ref_good');
    });

    it('ignores an unresolvable code without failing the application', async () => {
        // The resolver returns null for an unknown/inactive code; apply must succeed.
        const { service, schoolRequests } = setup(createFakeAdminApi(async () => null));

        const result = await service.apply({
            ...APPLICATION,
            referralCode: 'ref_bad',
            verificationTicket: ticketFor(APPLICATION.coordinatorEmail),
        });

        expect(result.status).toBe('PENDING');
        expect(schoolRequests[0].submittedByPartnerId).toBeNull();
        expect(schoolRequests[0].submittedViaReferralCode).toBeNull();
    });

    it('does not resolve a code when a partner already onboarded directly', async () => {
        const adminApi = createFakeAdminApi(async () => 'should-not-be-used');
        const { service, schoolRequests } = setup(adminApi);

        // The authenticated /partner/schools path passes submittedByPartnerId.
        await service.apply({ ...APPLICATION, referralCode: 'ref_good' }, 'direct-partner');

        expect(adminApi.resolvePartnerIdByReferralCode).not.toHaveBeenCalled();
        expect(schoolRequests[0].submittedByPartnerId).toBe('direct-partner');
    });

    it('rejecting an unprovisioned request creates no school or user', async () => {
        const { service, schools, users } = setup();
        await service.apply(APPLICATION, 'partner-99');
        const [request] = await service.list();

        await service.decide(request.id, { decision: 'REJECTED', reason: 'Duplicate' }, 'a');

        expect(schools).toHaveLength(0);
        expect(users).toHaveLength(0);
    });
});

describe('login', () => {
    it('signs in the approved school the token belongs to', async () => {
        const { service, schools, users } = setup();
        const { token } = await approved(service);

        const result = await service.login({ accessToken: token });

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
            service.login({ accessToken: `  ${token.toLowerCase()} ` }),
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

        const asA = await service.login({ accessToken: a.token });
        const asB = await service.login({ accessToken: b.token });

        expect(asA.school.id).not.toBe(asB.school.id);
        expect(asA.school.name).toBe('Delhi Public School, Sector 12');
        expect(asB.school.name).toBe('St. Xavier');
    });

    it('refuses a token that was never issued', async () => {
        const { service } = setup();
        await approved(service);

        await expect(
            service.login({ accessToken: generateAccessToken('SCHOOL') }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a partner token, and a JWT', async () => {
        const { service } = setup();
        await expect(
            service.login({ accessToken: generateAccessToken('PARTNER') }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(
            service.login({ accessToken: 'eyJhbGciOi.eyJzdWIi.sig' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('records when the token was last used', async () => {
        const { service, schoolRequests } = setup();
        const { token } = await approved(service);
        expect(schoolRequests[0].tokenLastUsedAt).toBeNull();

        await service.login({ accessToken: token });

        expect(schoolRequests[0].tokenLastUsedAt).toBeInstanceOf(Date);
    });
});

describe('login with email + password (self-applied school)', () => {
    /** Self-apply -> approve, so the coordinator has both a password and a token. */
    async function approvedSelfApply(service: SchoolService) {
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.coordinatorEmail) });
        const [request] = await service.list();
        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');
        return request.id;
    }

    it('signs in with the coordinator email and chosen password', async () => {
        const { service } = setup();
        await approvedSelfApply(service);

        const result = await service.login({
            coordinatorEmail: APPLICATION.coordinatorEmail,
            password: APPLICATION.password,
        });

        expect(result.school.name).toBe('Delhi Public School, Sector 12');
    });

    it('is case-insensitive on the email', async () => {
        const { service } = setup();
        await approvedSelfApply(service);

        await expect(
            service.login({
                coordinatorEmail: APPLICATION.coordinatorEmail.toUpperCase(),
                password: APPLICATION.password,
            }),
        ).resolves.toBeDefined();
    });

    it('rejects the wrong password', async () => {
        const { service } = setup();
        await approvedSelfApply(service);

        await expect(
            service.login({ coordinatorEmail: APPLICATION.coordinatorEmail, password: 'nope' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email in the same way as a wrong password (no enumeration)', async () => {
        const { service } = setup();

        await expect(
            service.login({ coordinatorEmail: 'nobody@example.com', password: 'whatever123' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('a partner-submitted school cannot sign in with email until a password is set', async () => {
        const { service } = setup();
        await service.apply(APPLICATION, 'partner-99');
        const [request] = await service.list();
        request.emailVerifiedAt = new Date();
        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');

        await expect(
            service.login({ coordinatorEmail: APPLICATION.coordinatorEmail, password: 'anything' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});

describe('forgotPassword + confirmPasswordReset + resetPassword', () => {
    async function approvedSelfApply(service: SchoolService) {
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.coordinatorEmail) });
        const [request] = await service.list();
        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');
        return request.id;
    }

    it('rejects an unknown email', async () => {
        const { service } = setup();
        await expect(service.forgotPassword('nobody@example.com')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a partner-submitted school can set its first password through the forgot flow', async () => {
        const { service } = setup();
        await service.apply(APPLICATION, 'partner-99');
        const [request] = await service.list();
        request.emailVerifiedAt = new Date();
        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');

        await service.forgotPassword(APPLICATION.coordinatorEmail);
        const confirmed = await service.confirmPasswordReset(APPLICATION.coordinatorEmail, '123456');

        const newPassword = 'a brand new password ';
        await expect(
            service.resetPassword(APPLICATION.coordinatorEmail, confirmed.resetTicket, newPassword),
        ).resolves.toEqual({ status: 'PASSWORD_RESET' });

        const result = await service.login({
            coordinatorEmail: APPLICATION.coordinatorEmail,
            password: newPassword,
        });
        expect(result.school.name).toBe('Delhi Public School, Sector 12');
    });

    it('sends the OTP scoped to SCHOOL_RESET, distinct from the activation OTP', async () => {
        const { service, emailOtp } = setup();
        await approvedSelfApply(service);

        await service.forgotPassword(APPLICATION.coordinatorEmail);

        expect(emailOtp.sendOtp).toHaveBeenCalledWith('SCHOOL_RESET', APPLICATION.coordinatorEmail.toLowerCase());
    });

    it('the full round trip changes the password: old one stops working, new one signs in — not trimmed', async () => {
        const { service, notifications } = setup();
        await approvedSelfApply(service);

        await service.forgotPassword(APPLICATION.coordinatorEmail);
        const confirmed = await service.confirmPasswordReset(APPLICATION.coordinatorEmail, '123456');
        expect(confirmed.status).toBe('CONTINUE_RESET');

        // Deliberately includes trailing whitespace, mirroring the school
        // registration bug this feature exists alongside: the new password
        // must be stored byte-for-byte, or login (which never trims) would
        // fail against it for the same reason the old bug did.
        const newPassword = 'a brand new password ';
        await expect(
            service.resetPassword(APPLICATION.coordinatorEmail, confirmed.resetTicket, newPassword),
        ).resolves.toEqual({ status: 'PASSWORD_RESET' });
        expect(notifications.sendSchoolPasswordChanged).toHaveBeenCalledTimes(1);

        await expect(
            service.login({ coordinatorEmail: APPLICATION.coordinatorEmail, password: APPLICATION.password }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(
            service.login({ coordinatorEmail: APPLICATION.coordinatorEmail, password: newPassword }),
        ).resolves.toBeDefined();
        await expect(
            service.login({ coordinatorEmail: APPLICATION.coordinatorEmail, password: newPassword.trim() }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a reset ticket minted for a different email', async () => {
        const { service } = setup();
        await approvedSelfApply(service);
        await service.forgotPassword(APPLICATION.coordinatorEmail);
        const confirmed = await service.confirmPasswordReset(APPLICATION.coordinatorEmail, '123456');

        await expect(
            service.resetPassword('someone-else@example.com', confirmed.resetTicket, 'a brand new password'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('an activation ticket cannot be replayed as a reset ticket', async () => {
        const { service } = setup();
        await approvedSelfApply(service);

        await expect(
            service.resetPassword(
                APPLICATION.coordinatorEmail,
                ticketFor(APPLICATION.coordinatorEmail),
                'a brand new password',
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('decide — revoke and re-grant', () => {
    it('refuses login and deactivates the coordinator', async () => {
        const { service, users } = setup();
        const { requestId, token } = await approved(service);

        await service.decide(requestId, { decision: 'REVOKED', reason: 'Contract ended' }, 'a');

        // Deactivation is what kills a still-valid JWT on its next request.
        expect(users[0].isActive).toBe(false);
        await expect(service.login({ accessToken: token })).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it('re-granting restores access with the same token', async () => {
        const { service, users } = setup();
        const { requestId, token } = await approved(service);
        await service.decide(requestId, { decision: 'REVOKED', reason: 'pause' }, 'a');

        await service.decide(requestId, { decision: 'APPROVED', reason: 'resumed' }, 'a');

        expect(users[0].isActive).toBe(true);
        await expect(service.login({ accessToken: token })).resolves.toBeDefined();
    });
});

describe('card and rotateToken', () => {
    it('exists only for an approved school', async () => {
        const { service } = setup();
        await service.apply(APPLICATION, 'partner-99');
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
        await expect(service.login({ accessToken: old })).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        if (!rotated.accessToken) throw new Error('test setup: rotated token missing');
        await expect(service.login({ accessToken: rotated.accessToken })).resolves.toBeDefined();
    });

    it('audits every decision and rotation', async () => {
        const { service, auditLogs } = setup();
        const { requestId } = await approved(service);
        await service.rotateToken(requestId, 'admin-1');

        expect(auditLogs.map((l) => l.action)).toEqual(['school.approved', 'school.token.rotated']);
    });
});
