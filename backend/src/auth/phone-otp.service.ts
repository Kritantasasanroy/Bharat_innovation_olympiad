import {
    BadRequestException,
    Injectable,
    Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from './phone.helpers';

const CODE_TTL_MS = 5 * 60 * 1000;
/** Wrong guesses allowed before a code is burned. 6 digits = 1e6 space. */
const MAX_ATTEMPTS = 5;
/** Codes a number may request per window, to stop OTP-bombing someone's phone. */
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class PhoneOtpService {
    private readonly logger = new Logger(PhoneOtpService.name);

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

    async sendOtp(
        rawPhone: string,
        channel: 'sms' | 'voice' = 'sms',
    ): Promise<{ sent: true; channel: 'sms' | 'voice'; expiresInSeconds: number }> {
        const phone = normalizePhone(rawPhone);

        const recentSends = await this.prisma.phoneOtp.count({
            where: { phone, createdAt: { gt: new Date(Date.now() - SEND_WINDOW_MS) } },
        });
        if (recentSends >= MAX_SENDS_PER_WINDOW) {
            throw new BadRequestException(
                'Too many codes requested for this number. Please wait a few minutes and try again.',
            );
        }

        const code = this.generateCode();
        const expiresAt = new Date(Date.now() + CODE_TTL_MS);

        // Supersede any outstanding code so only the newest one works.
        await this.prisma.phoneOtp.updateMany({
            where: { phone, consumedAt: null },
            data: { consumedAt: new Date() },
        });

        await this.prisma.phoneOtp.create({
            data: { phone, codeHash: this.hash(code), expiresAt },
        });

        // Deliberately not caught: the student is waiting on this code, so a
        // delivery failure must surface rather than leave them at a dead
        // code-entry box.
        if (channel === 'voice') {
            await this.notifications.sendOtpVoice(phone, code);
        } else {
            await this.notifications.sendOtpSms(phone, code);
        }

        return { sent: true, channel, expiresInSeconds: Math.floor(CODE_TTL_MS / 1000) };
    }

    /**
     * Check a submitted code. Returns the normalised phone on success so the
     * caller can resolve the account without re-parsing user input.
     */
    async verifyOtp(rawPhone: string, code: string): Promise<string> {
        const phone = normalizePhone(rawPhone);

        const otp = await this.prisma.phoneOtp.findFirst({
            where: { phone, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });

        // Same message for "never requested", "expired" and "already used" —
        // distinguishing them tells an attacker which numbers are in play.
        const invalid = new BadRequestException('This code is invalid or has expired. Request a new one.');
        if (!otp || otp.expiresAt < new Date()) throw invalid;

        if (otp.attempts >= MAX_ATTEMPTS) {
            await this.prisma.phoneOtp.update({
                where: { id: otp.id },
                data: { consumedAt: new Date() },
            });
            throw new BadRequestException('Too many incorrect attempts. Request a new code.');
        }

        const submitted = Buffer.from(this.hash((code ?? '').trim()));
        const expected = Buffer.from(otp.codeHash);
        const matches =
            submitted.length === expected.length && crypto.timingSafeEqual(submitted, expected);

        if (!matches) {
            await this.prisma.phoneOtp.update({
                where: { id: otp.id },
                data: { attempts: { increment: 1 } },
            });
            throw invalid;
        }

        // Single-use: burn it before returning so a replay cannot reuse it.
        await this.prisma.phoneOtp.update({
            where: { id: otp.id },
            data: { consumedAt: new Date() },
        });

        return phone;
    }
}
