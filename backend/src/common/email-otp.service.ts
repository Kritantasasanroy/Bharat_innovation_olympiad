import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';

const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses allowed before a code is burned. 6 digits = 1e6 space. */
const MAX_ATTEMPTS = 5;
/** Codes an address may request per window, to stop OTP-bombing someone's inbox. */
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

export type EmailOtpKind = 'SCHOOL' | 'PARTNER';

/**
 * Email verify-first, by 6-digit code — the same OTP shape as student
 * registration's `PhoneOtpService`, just delivered by email instead of SMS.
 * Shared by `SchoolService` and `PartnerService`'s self-service `apply()`
 * entry points; each owns interpreting the result (duplicate-application
 * checks, minting the post-verify `verificationTicket`), this just proves
 * control of the address.
 */
@Injectable()
export class EmailOtpService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationService,
    ) {}

    private hash(code: string): string {
        return crypto.createHash('sha256').update(code).digest('hex');
    }

    /** Uniform over 000000–999999; Math.random is not acceptable for a credential. */
    private generateCode(): string {
        return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    }

    async sendOtp(kind: EmailOtpKind, rawEmail: string): Promise<{ sent: boolean; expiresInSeconds: number }> {
        const email = rawEmail.trim().toLowerCase();

        const recentSends = await this.prisma.emailOtp.count({
            where: { kind, email, createdAt: { gt: new Date(Date.now() - SEND_WINDOW_MS) } },
        });
        if (recentSends >= MAX_SENDS_PER_WINDOW) {
            throw new BadRequestException(
                'Too many codes requested for this email. Please wait a few minutes and try again.',
            );
        }

        const expiresAt = new Date(Date.now() + CODE_TTL_MS);
        const code = this.generateCode();

        // Supersede any outstanding code so only the newest one works.
        await this.prisma.emailOtp.updateMany({
            where: { kind, email, consumedAt: null },
            data: { consumedAt: new Date() },
        });
        await this.prisma.emailOtp.create({
            data: { kind, email, codeHash: this.hash(code), expiresAt },
        });

        const emailSent =
            kind === 'SCHOOL'
                ? await this.notifications.sendSchoolStartVerification(email, { code })
                : await this.notifications.sendPartnerStartVerification(email, { code });

        return { sent: emailSent, expiresInSeconds: Math.floor(CODE_TTL_MS / 1000) };
    }

    /**
     * Check a submitted code. Returns the normalised email on success so the
     * caller can mint a ticket without re-parsing user input.
     */
    async verifyOtp(kind: EmailOtpKind, rawEmail: string, rawCode: string): Promise<string> {
        const email = rawEmail.trim().toLowerCase();

        const otp = await this.prisma.emailOtp.findFirst({
            where: { kind, email, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });

        // Same message for "never requested", "expired" and "already used" —
        // distinguishing them tells an attacker which addresses are in play.
        const invalid = new BadRequestException('This code is invalid or has expired. Request a new one.');
        if (!otp || otp.expiresAt < new Date()) throw invalid;

        if (otp.attempts >= MAX_ATTEMPTS) {
            await this.prisma.emailOtp.update({
                where: { id: otp.id },
                data: { consumedAt: new Date() },
            });
            throw new BadRequestException('Too many incorrect attempts. Request a new code.');
        }

        const submitted = Buffer.from(this.hash((rawCode ?? '').trim()));
        const expected = Buffer.from(otp.codeHash);
        const matches =
            submitted.length === expected.length && crypto.timingSafeEqual(submitted, expected);

        if (!matches) {
            await this.prisma.emailOtp.update({
                where: { id: otp.id },
                data: { attempts: { increment: 1 } },
            });
            throw invalid;
        }

        // Single-use: burn it before returning so a replay cannot reuse it.
        await this.prisma.emailOtp.update({
            where: { id: otp.id },
            data: { consumedAt: new Date() },
        });

        return email;
    }
}
