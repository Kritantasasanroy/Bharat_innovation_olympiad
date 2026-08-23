import { createHash, randomBytes } from 'node:crypto';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export interface EmailVerificationChallenge {
    rawToken: string;
    tokenHash: string;
    expiresAt: Date;
    sentAt: Date;
}

export function createEmailVerificationChallenge(now = new Date()): EmailVerificationChallenge {
    const rawToken = randomBytes(32).toString('base64url');
    return {
        rawToken,
        tokenHash: hashEmailVerificationToken(rawToken),
        expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        sentAt: now,
    };
}

export function hashEmailVerificationToken(rawToken: string): string {
    return createHash('sha256').update(rawToken.trim(), 'utf8').digest('hex');
}

export function cooldownRemainingSeconds(
    sentAt: Date | null | undefined,
    now = new Date(),
): number {
    if (!sentAt) return 0;
    const remaining = sentAt.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - now.getTime();
    return Math.max(0, Math.ceil(remaining / 1000));
}
