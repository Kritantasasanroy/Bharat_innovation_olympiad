import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

function matches(row: PartnerRequestRow, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => row[key as keyof PartnerRequestRow] === value);
}

function createTestContext() {
    let nextId = 1;
    const rows: PartnerRequestRow[] = [];
    const sendPartnerEmailVerification = jest.fn(
        (_to: string, _vars: VerificationVars): Promise<boolean> => Promise.resolve(true),
    );
    const notifications = {
        sendPartnerEmailVerification,
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

    return { service, rows, notifications, adminApi };
}

const APPLICATION = {
    orgName: 'Test partner',
    contactPerson: 'Asha Rao',
    email: 'Asha@example.com',
    phone: '+919812345678',
    password: 'correct horse battery staple',
};

describe('partner email-first access lifecycle', () => {
    it('creates an unverified request and sends a verification message', async () => {
        const { service, rows, notifications } = createTestContext();

        const result = await service.apply(APPLICATION);

        expect(result).toMatchObject({
            status: 'EMAIL_VERIFICATION_REQUIRED',
            email: 'asha@example.com',
        });
        expect(rows[0]?.emailVerifiedAt).toBeNull();
        expect(rows[0]?.emailVerificationTokenHash).toBeTruthy();
        expect(notifications.sendPartnerEmailVerification).toHaveBeenCalledTimes(1);
    });

    it('blocks approval until the contact email is verified', async () => {
        const { service, rows, adminApi } = createTestContext();
        await service.apply(APPLICATION);
        const request = rows[0];
        if (!request) throw new Error('test fixture request missing');

        await expect(
            service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(adminApi.createApplication).not.toHaveBeenCalled();
    });

    it('verifies once, queues the request, and makes a replay idempotent', async () => {
        const { service, rows, notifications } = createTestContext();
        await service.apply(APPLICATION);
        const token = notifications.sendPartnerEmailVerification.mock.calls[0]?.[1].token;

        const first = await service.verifyEmail(token);
        const second = await service.verifyEmail(token);

        expect(first.status).toBe('PENDING');
        expect(second.status).toBe('ALREADY_VERIFIED');
        expect(rows[0]?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(notifications.sendPartnerApplicationReceived).toHaveBeenCalledTimes(1);
    });

    it('rejects expired links and illegal access transitions', async () => {
        const { service, rows, notifications } = createTestContext();
        await service.apply(APPLICATION);
        const request = rows[0];
        if (!request) throw new Error('test fixture request missing');
        request.emailVerificationTokenExpiresAt = new Date(Date.now() - 1);
        const token = notifications.sendPartnerEmailVerification.mock.calls[0]?.[1].token;

        await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);

        request.emailVerifiedAt = new Date();
        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');
        await expect(
            service.decide(request.id, { decision: 'REJECTED', reason: 'Not now' }, 'admin-1'),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not issue a session until the verified request is approved', async () => {
        const { service, rows, notifications } = createTestContext();
        await service.apply(APPLICATION);
        const request = rows[0];
        if (!request) throw new Error('test fixture request missing');
        const token = notifications.sendPartnerEmailVerification.mock.calls[0]?.[1].token;

        await expect(service.login({ email: APPLICATION.email, password: APPLICATION.password })).rejects.toBeInstanceOf(
            ForbiddenException,
        );

        await service.verifyEmail(token);
        await expect(service.login({ email: APPLICATION.email, password: APPLICATION.password })).rejects.toBeInstanceOf(
            ForbiddenException,
        );

        await service.decide(request.id, { decision: 'APPROVED', reason: 'Ready' }, 'admin-1');
        await expect(service.login({ email: APPLICATION.email, password: APPLICATION.password })).resolves.toMatchObject({
            accessToken: 'session.jwt',
            partner: { id: 'partner-1' },
        });
    });
});
