import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { issueActivationTicket } from '../common/activation-ticket';
import { PartnerAdminApiClient } from './admin-api.client';
import { PartnerService } from './partner.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

type PartnerRequestRow = {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    passwordHash: string;
    status: Status;
    emailVerifiedAt: Date | null;
    emailVerificationTokenHash: string | null;
    emailVerificationTokenExpiresAt: Date | null;
    emailVerificationSentAt: Date | null;
    emailVerificationTokenUsedAt: Date | null;
    partnerId: string | null;
    applicationId: string | null;
    accessTokenHash: string | null;
    accessTokenSealed: string | null;
    tokenIssuedAt: Date | null;
    tokenLastUsedAt: Date | null;
    decisionReason: string | null;
    decidedBy: string | null;
    decidedAt: Date | null;
    createdAt: Date;
};

type VerificationVars = { contactPerson: string; orgName: string; token: string };

type PreActivationRow = {
    id: string;
    kind: 'SCHOOL' | 'PARTNER';
    email: string;
    verifiedAt: Date | null;
    tokenHash: string;
    tokenExpiresAt: Date;
    tokenSentAt: Date;
    tokenUsedAt: Date | null;
};

function matches<T extends Record<string, unknown>>(row: T, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            return matches(row, value as Record<string, unknown>);
        }
        return row[key as keyof T] === value;
    });
}

/** A valid verify-first ticket for a self-applying partner's email. */
function ticketFor(email: string): string {
    return issueActivationTicket('PARTNER', email.trim().toLowerCase());
}

function createTestContext() {
    let nextId = 1;
    const rows: PartnerRequestRow[] = [];
    const preActivations: PreActivationRow[] = [];
    const sendPartnerEmailVerification = jest.fn(
        (_to: string, _vars: VerificationVars): Promise<boolean> => Promise.resolve(true),
    );
    const notifications = {
        sendPartnerEmailVerification,
        sendPartnerStartVerification: jest.fn(
            (_to: string, _vars: { token: string }): Promise<boolean> => Promise.resolve(true),
        ),
        sendPartnerApplicationReceived: jest.fn(
            (_to: string, _contactPerson: string, _orgName: string): Promise<boolean> => Promise.resolve(true),
        ),
        sendPartnerApproved: jest.fn(
            (_to: string, _vars: { contactPerson: string; orgName: string; accessToken: string }): Promise<boolean> =>
                Promise.resolve(true),
        ),
        sendPartnerRejected: jest.fn(
            (_to: string, _vars: { contactPerson: string; orgName: string; reason: string }): Promise<boolean> =>
                Promise.resolve(true),
        ),
        sendPartnerRevoked: jest.fn(
            (_to: string, _vars: { contactPerson: string; orgName: string; reason: string }): Promise<boolean> =>
                Promise.resolve(true),
        ),
    };

    const prisma = {
        partnerRequest: {
            findUnique: async ({ where }: { where: Record<string, unknown> }) =>
                rows.find((row) => matches(row, where)) ?? null,
            findMany: async () => [...rows],
            create: async ({ data }: { data: Partial<PartnerRequestRow> }) => {
                const row: PartnerRequestRow = {
                    id: `request-${nextId++}`,
                    orgName: data.orgName ?? '',
                    contactPerson: data.contactPerson ?? '',
                    email: data.email ?? '',
                    phone: data.phone ?? '',
                    passwordHash: data.passwordHash ?? '',
                    status: data.status ?? 'PENDING',
                    emailVerifiedAt: data.emailVerifiedAt ?? null,
                    emailVerificationTokenHash: data.emailVerificationTokenHash ?? null,
                    emailVerificationTokenExpiresAt: data.emailVerificationTokenExpiresAt ?? null,
                    emailVerificationSentAt: data.emailVerificationSentAt ?? null,
                    emailVerificationTokenUsedAt: data.emailVerificationTokenUsedAt ?? null,
                    partnerId: data.partnerId ?? null,
                    applicationId: data.applicationId ?? null,
                    accessTokenHash: data.accessTokenHash ?? null,
                    accessTokenSealed: data.accessTokenSealed ?? null,
                    tokenIssuedAt: data.tokenIssuedAt ?? null,
                    tokenLastUsedAt: data.tokenLastUsedAt ?? null,
                    decisionReason: data.decisionReason ?? null,
                    decidedBy: data.decidedBy ?? null,
                    decidedAt: data.decidedAt ?? null,
                    createdAt: data.createdAt ?? new Date(),
                };
                rows.push(row);
                return row;
            },
            update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const row = rows.find((candidate) => matches(candidate, where));
                if (!row) throw new Error('test fixture row not found');
                Object.assign(row, data);
                return row;
            },
            updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const row = rows.find((candidate) => matches(candidate, where));
                if (!row) return { count: 0 };
                Object.assign(row, data);
                return { count: 1 };
            },
        },
        preActivationVerification: {
            findUnique: async ({ where }: { where: Record<string, unknown> }) =>
                preActivations.find((row) => matches(row, where)) ?? null,
            create: async ({ data }: { data: Partial<PreActivationRow> }) => {
                const row: PreActivationRow = {
                    id: `preact-${nextId++}`,
                    kind: data.kind ?? 'PARTNER',
                    email: data.email ?? '',
                    verifiedAt: data.verifiedAt ?? null,
                    tokenHash: data.tokenHash ?? '',
                    tokenExpiresAt: data.tokenExpiresAt ?? new Date(),
                    tokenSentAt: data.tokenSentAt ?? new Date(),
                    tokenUsedAt: data.tokenUsedAt ?? null,
                };
                preActivations.push(row);
                return row;
            },
            update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const row = preActivations.find((candidate) => matches(candidate, where));
                if (!row) throw new Error('test fixture row not found');
                Object.assign(row, data);
                return row;
            },
            updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const row = preActivations.find((candidate) => matches(candidate, where));
                if (!row) return { count: 0 };
                Object.assign(row, data);
                return { count: 1 };
            },
        },
        auditLog: {
            create: async (_input: unknown) => undefined,
        },
    } as unknown as PrismaService;

    const adminApi = {
        createApplication: jest.fn(async () => ({
            id: 'application-1',
            partnerId: 'partner-1',
            orgName: 'Test partner',
            contactPerson: 'Asha Rao',
            email: 'asha@example.com',
            phone: '+919812345678',
            status: 'SUBMITTED',
        })),
        setAccess: jest.fn(async (_partnerId: string, status: string) => ({ id: 'partner-1', status })),
    } as unknown as PartnerAdminApiClient;

    const jwt = {
        sign: jest.fn(() => 'session.jwt'),
    } as unknown as JwtService;

    const service = new PartnerService(
        prisma,
        jwt,
        adminApi,
        notifications as unknown as NotificationService,
    );

    return { service, rows, preActivations, notifications, adminApi };
}

const APPLICATION = {
    orgName: 'Test partner',
    contactPerson: 'Asha Rao',
    email: 'Asha@example.com',
    phone: '+919812345678',
    password: 'correct horse battery staple',
};

describe('startVerification + verifyEmail (verify-first)', () => {
    it('rejects an email that already has an application, before any details are collected', async () => {
        const { service, rows } = createTestContext();
        rows.push({
            id: 'existing-1',
            orgName: 'Existing Co',
            contactPerson: 'Someone',
            email: 'asha@example.com',
            phone: '+919812345678',
            passwordHash: 'hash',
            status: 'PENDING',
            emailVerifiedAt: new Date(),
            emailVerificationTokenHash: null,
            emailVerificationTokenExpiresAt: null,
            emailVerificationSentAt: null,
            emailVerificationTokenUsedAt: null,
            partnerId: null,
            applicationId: null,
            accessTokenHash: null,
            accessTokenSealed: null,
            tokenIssuedAt: null,
            tokenLastUsedAt: null,
            decisionReason: null,
            decidedBy: null,
            decidedAt: null,
            createdAt: new Date(),
        });

        await expect(service.startVerification(APPLICATION.email)).rejects.toBeInstanceOf(ConflictException);
    });

    it('confirming mints a ticket that apply() accepts, and only once', async () => {
        const { service, notifications } = createTestContext();

        await service.startVerification(APPLICATION.email);
        const token = notifications.sendPartnerStartVerification.mock.calls[0]?.[1].token;

        const confirmed = await service.verifyEmail(token);
        expect(confirmed.status).toBe('CONTINUE_APPLICATION');
        if (confirmed.status !== 'CONTINUE_APPLICATION') throw new Error('unreachable');

        const result = await service.apply({ ...APPLICATION, verificationTicket: confirmed.submissionTicket });
        expect(result.status).toBe('PENDING');

        // Re-clicking the same link a second time must not mint another ticket.
        const replay = await service.verifyEmail(token);
        expect(replay.status).toBe('ALREADY_VERIFIED');
    });

    it('rejects an expired start-verification link', async () => {
        const { service, preActivations, notifications } = createTestContext();
        await service.startVerification(APPLICATION.email);
        preActivations[0].tokenExpiresAt = new Date(Date.now() - 1);
        const token = notifications.sendPartnerStartVerification.mock.calls[0]?.[1].token;

        await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('apply (self-service, verify-first)', () => {
    it('creates an already-verified PENDING request, no separate email-verify step', async () => {
        const { service, rows, notifications } = createTestContext();

        const result = await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.email) });

        expect(result).toMatchObject({ status: 'PENDING', email: 'asha@example.com' });
        expect(rows[0]?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(notifications.sendPartnerApplicationReceived).toHaveBeenCalledTimes(1);
        expect(notifications.sendPartnerEmailVerification).not.toHaveBeenCalled();
    });

    it('refuses to submit without proof the email was verified', async () => {
        const { service } = createTestContext();

        await expect(
            service.apply({ ...APPLICATION, verificationTicket: '' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a ticket minted for a different email', async () => {
        const { service } = createTestContext();

        await expect(
            service.apply({ ...APPLICATION, verificationTicket: ticketFor('someone-else@example.com') }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('illegal access transitions are still rejected once approved', async () => {
        const { service, rows } = createTestContext();
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.email) });
        const request = rows[0];
        if (!request) throw new Error('test fixture request missing');

        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');
        await expect(
            service.decide(request.id, { decision: 'REJECTED', reason: 'Not now' }, 'admin-1'),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not issue a session until the request is approved', async () => {
        const { service, rows } = createTestContext();
        await service.apply({ ...APPLICATION, verificationTicket: ticketFor(APPLICATION.email) });
        const request = rows[0];
        if (!request) throw new Error('test fixture request missing');

        await expect(
            service.login({ email: APPLICATION.email, password: APPLICATION.password }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');
        await expect(
            service.login({ email: APPLICATION.email, password: APPLICATION.password }),
        ).resolves.toMatchObject({
            accessToken: 'session.jwt',
            partner: { id: 'partner-1' },
        });
    });
});
