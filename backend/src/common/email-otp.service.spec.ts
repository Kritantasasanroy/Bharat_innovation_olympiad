import { BadRequestException } from '@nestjs/common';
import { notificationServiceStub } from '../notification/notification.stub';
import type { NotificationService } from '../notification/notification.service';
import type { PrismaService } from '../prisma/prisma.service';
import { EmailOtpService } from './email-otp.service';

/**
 * In-memory fake of the `EmailOtp` slice this service touches. Mirrors the
 * `match`/row-mutation conventions used by `school.service.spec.ts` and
 * `partner.service.spec.ts`, which stub this whole service rather than
 * re-implementing this table — the interesting OTP logic (hashing, expiry,
 * attempts, rate limiting) is tested once here.
 */
type Row = {
    id: string;
    kind: 'SCHOOL' | 'PARTNER';
    email: string;
    codeHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
    attempts: number;
    createdAt: Date;
};

/** Handles Prisma's atomic `{ increment: n }` shape, which a plain `Object.assign` would clobber into. */
function applyUpdate(row: Row, data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
            const current = row[key as keyof Row] as number;
            (row[key as keyof Row] as unknown as number) = current + (value as { increment: number }).increment;
        } else {
            (row[key as keyof Row] as unknown) = value;
        }
    }
}

function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && !(value instanceof Date) && 'gt' in value) {
            return (row[key as keyof Row] as Date) > (value as { gt: Date }).gt;
        }
        return row[key as keyof Row] === value;
    });
}

function createTestContext() {
    let nextId = 1;
    const rows: Row[] = [];

    const prisma = {
        emailOtp: {
            count: async ({ where = {} }: { where?: Record<string, unknown> }) =>
                rows.filter((row) => matches(row, where)).length,
            findFirst: async ({
                where = {},
                orderBy,
            }: { where?: Record<string, unknown>; orderBy?: { createdAt: 'asc' | 'desc' } }) => {
                const matched = rows.filter((row) => matches(row, where));
                if (orderBy?.createdAt === 'desc') {
                    matched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                }
                return matched[0] ?? null;
            },
            create: async ({ data }: { data: Partial<Row> }) => {
                const row: Row = {
                    id: `otp-${nextId++}`,
                    kind: data.kind ?? 'SCHOOL',
                    email: data.email ?? '',
                    codeHash: data.codeHash ?? '',
                    expiresAt: data.expiresAt ?? new Date(),
                    consumedAt: data.consumedAt ?? null,
                    attempts: data.attempts ?? 0,
                    createdAt: data.createdAt ?? new Date(),
                };
                rows.push(row);
                return row;
            },
            update: async ({
                where,
                data,
            }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const row = rows.find((candidate) => matches(candidate, where));
                if (!row) throw new Error('test fixture row not found');
                applyUpdate(row, data);
                return row;
            },
            updateMany: async ({
                where,
                data,
            }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
                const matched = rows.filter((row) => matches(row, where));
                for (const row of matched) applyUpdate(row, data);
                return { count: matched.length };
            },
        },
    } as unknown as PrismaService;

    const notifications = notificationServiceStub();
    const service = new EmailOtpService(prisma, notifications as unknown as NotificationService);

    return { service, rows, notifications };
}

describe('EmailOtpService', () => {
    it('sends a 6-digit code and delivers it through the right kind-specific mail', async () => {
        const { service, notifications } = createTestContext();

        const result = await service.sendOtp('SCHOOL', 'Coordinator@School.Example');

        expect(result.sent).toBe(true);
        expect(notifications.sendSchoolStartVerification).toHaveBeenCalledTimes(1);
        expect(notifications.sendPartnerStartVerification).not.toHaveBeenCalled();
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;
        expect(code).toMatch(/^\d{6}$/);
    });

    it('routes a PARTNER send through the partner mail instead', async () => {
        const { service, notifications } = createTestContext();

        await service.sendOtp('PARTNER', 'contact@org.example');

        expect(notifications.sendPartnerStartVerification).toHaveBeenCalledTimes(1);
        expect(notifications.sendSchoolStartVerification).not.toHaveBeenCalled();
    });

    it('verifies the correct code and normalises the email', async () => {
        const { service, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'Coordinator@School.Example');
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;

        const email = await service.verifyOtp('SCHOOL', 'COORDINATOR@school.example', code);

        expect(email).toBe('coordinator@school.example');
    });

    it('rejects a code from the wrong kind (SCHOOL code cannot verify a PARTNER OTP)', async () => {
        const { service, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'shared@example.com');
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;

        await expect(service.verifyOtp('PARTNER', 'shared@example.com', code)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('is single-use — verifying twice fails the second time', async () => {
        const { service, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'coordinator@school.example');
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;

        await service.verifyOtp('SCHOOL', 'coordinator@school.example', code);

        await expect(
            service.verifyOtp('SCHOOL', 'coordinator@school.example', code),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a fresh send supersedes the previous code', async () => {
        const { service, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'coordinator@school.example');
        const first = notifications.sendSchoolStartVerification.mock.calls[0][1].code;

        await service.sendOtp('SCHOOL', 'coordinator@school.example');
        const second = notifications.sendSchoolStartVerification.mock.calls[1][1].code;

        await expect(service.verifyOtp('SCHOOL', 'coordinator@school.example', first)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            service.verifyOtp('SCHOOL', 'coordinator@school.example', second),
        ).resolves.toBe('coordinator@school.example');
    });

    it('rejects an expired code', async () => {
        const { service, rows, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'coordinator@school.example');
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;
        rows[0].expiresAt = new Date(Date.now() - 1);

        await expect(
            service.verifyOtp('SCHOOL', 'coordinator@school.example', code),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a wrong guess without burning the code, up to a limit', async () => {
        const { service, rows, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'coordinator@school.example');
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;

        await expect(
            service.verifyOtp('SCHOOL', 'coordinator@school.example', '000000'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(rows[0].attempts).toBe(1);

        // The right code still works after one wrong guess.
        await expect(
            service.verifyOtp('SCHOOL', 'coordinator@school.example', code),
        ).resolves.toBe('coordinator@school.example');
    });

    it('locks the code out after too many wrong guesses, even with the right code', async () => {
        const { service, notifications } = createTestContext();
        await service.sendOtp('SCHOOL', 'coordinator@school.example');
        const code = notifications.sendSchoolStartVerification.mock.calls[0][1].code;

        for (let i = 0; i < 5; i += 1) {
            await expect(
                service.verifyOtp('SCHOOL', 'coordinator@school.example', '000000'),
            ).rejects.toBeInstanceOf(BadRequestException);
        }

        await expect(
            service.verifyOtp('SCHOOL', 'coordinator@school.example', code),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rate-limits repeated sends to the same address', async () => {
        const { service } = createTestContext();

        for (let i = 0; i < 5; i += 1) {
            await service.sendOtp('SCHOOL', 'coordinator@school.example');
        }

        await expect(service.sendOtp('SCHOOL', 'coordinator@school.example')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
