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

export type EmailOtpKind =
    | 'SCHOOL'
    | 'PARTNER'
    | 'SCHOOL_RESET'
    | 'PARTNER_RESET'
    /** A student signing in or registering on the portal. */
    | 'STUDENT';

/**
 * Email verify-first, by 6-digit code — the same OTP shape as student
 * registration's `PhoneOtpService`, just delivered by email instead of SMS.
 * Shared by `SchoolService` and `PartnerService`'s self-service `apply()`
 * entry points (kinds `SCHOOL`/`PARTNER`) and their forgot-password flows
 * (kinds `SCHOOL_RESET`/`PARTNER_RESET`); each owns interpreting the result
 * (duplicate-application checks, minting the post-verify ticket), this just
 * proves control of the address. The `_RESET` kinds are namespaced apart from
 * their non-reset counterpart so a code sent for one purpose can never be
 * replayed to complete the other.
 *
 * `STUDENT` was added when student email sign-in moved off Neon Auth's hosted
 * `/email-otp/*` endpoints: Neon sent the code from a shared address we do not
 * control, and the browser was the only thing that checked the result. The same
 * namespacing applies — a student's code is not redeemable on a school or
 * partner flow, and vice versa.
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

    /**
     * The name shown in a `STUDENT` code email.
     *
     * Registration passes the typed first name straight through — the form
     * validates it before the OTP step, so it is always there. Sign-in passes
     * nothing, because a student signing in has typed only their email; this
     * looks up the account instead. An email with no account (someone probing,
     * or a genuine typo) resolves to `null`, and the template's fallback line
     * is written to not reveal that distinction either way.
     */
    private async resolveStudentName(email: string, typed?: string): Promise<string | null> {
        const trimmed = typed?.trim();
        if (trimmed) return trimmed;
        const user = await this.prisma.user.findUnique({ where: { email }, select: { firstName: true } });
        return user?.firstName?.trim() || null;
    }

    private async sendCode(
        kind: EmailOtpKind,
        email: string,
        code: string,
        studentName?: string,
    ): Promise<boolean> {
        switch (kind) {
            case 'SCHOOL':
                return this.notifications.sendSchoolStartVerification(email, { code });
            case 'PARTNER':
                return this.notifications.sendPartnerStartVerification(email, { code });
            case 'SCHOOL_RESET':
                return this.notifications.sendSchoolPasswordResetCode(email, { code });
            case 'PARTNER_RESET':
                return this.notifications.sendPartnerPasswordResetCode(email, { code });
            case 'STUDENT': {
                // The only kind that lets a delivery failure through. The others
                // are steps in a form a person is filling in and can retry; this
                // one *is* the sign-in, so a student who is told "code sent"
                // when nothing was sent has no way forward and no error to act
                // on. `sendEmailOtp` throws, and that is the point.
                const name = await this.resolveStudentName(email, studentName);
                return this.notifications
                    .sendEmailOtp(email, code, name, Math.floor(CODE_TTL_MS / 60_000))
                    .then(() => true);
            }
        }
    }

    /**
     * `studentName` is meaningful only for `kind: 'STUDENT'` — the other kinds
     * ignore it. It is an extra parameter rather than a second method because
     * every caller already goes through this one shared rate-limit / single-use
     * bookkeeping, and duplicating that for one kind is how the two drift.
     */
    async sendOtp(
        kind: EmailOtpKind,
        rawEmail: string,
        studentName?: string,
    ): Promise<{ sent: boolean; expiresInSeconds: number }> {
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

        const emailSent = await this.sendCode(kind, email, code, studentName);

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
