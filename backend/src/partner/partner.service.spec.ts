import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { issueActivationTicket } from '../common/activation-ticket';
import type { EmailOtpService } from '../common/email-otp.service';
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

/**
 * A lightweight double, not a fake table: `EmailOtpService` gets its own
 * dedicated coverage in `common/email-otp.service.spec.ts` (hashing, expiry,
 * attempts, rate limiting). `PartnerService` only needs to be tested on how
 * it interprets that contract — a duplicate-application email is still
 * checked before ever calling this, and a valid code hands back the
 * normalised email.
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

function createTestContext() {
    let nextId = 1;
    const rows: PartnerRequestRow[] = [];
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

    const emailOtp = createFakeEmailOtp();

    const service = new PartnerService(
        prisma,
        jwt,
        adminApi,
        notifications as unknown as NotificationService,
        emailOtp as unknown as EmailOtpService,
    );

    return { service, rows, emailOtp, notifications, adminApi };
}

const APPLICATION = {
    orgName: 'Test partner',
    contactPerson: 'Asha Rao',
    email: 'Asha@example.com',
    phone: '+919812345678',
    password: 'correct horse battery staple',
};

describe('startVerification + confirmVerification (verify-first, OTP)', () => {
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

    it('delegates the send to EmailOtpService, scoped to PARTNER', async () => {
        const { service, emailOtp } = createTestContext();

        await service.startVerification(APPLICATION.email);

        expect(emailOtp.sendOtp).toHaveBeenCalledWith('PARTNER', APPLICATION.email.toLowerCase());
    });

    it('confirming the right code mints a ticket that apply() accepts', async () => {
        const { service } = createTestContext();

        await service.startVerification(APPLICATION.email);
        const confirmed = await service.confirmVerification(APPLICATION.email, '123456');

        expect(confirmed.status).toBe('CONTINUE_APPLICATION');
        const result = await service.apply({ ...APPLICATION, verificationTicket: confirmed.submissionTicket });
        expect(result.status).toBe('PENDING');
    });

    it('rejects the wrong code', async () => {
        const { service } = createTestContext();
        await service.startVerification(APPLICATION.email);

        await expect(service.confirmVerification(APPLICATION.email, '000000')).rejects.toBeInstanceOf(
            BadRequestException,
        );
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
