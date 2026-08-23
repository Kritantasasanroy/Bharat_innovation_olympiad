import {
    EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
    EMAIL_VERIFICATION_TTL_MS,
    cooldownRemainingSeconds,
    createEmailVerificationChallenge,
    hashEmailVerificationToken,
} from './email-verification-token';

describe('email verification tokens', () => {
    it('creates a random challenge with a hashed token and an expiry', () => {
        const now = new Date('2026-08-23T00:00:00.000Z');
        const challenge = createEmailVerificationChallenge(now);

        expect(challenge.rawToken).toHaveLength(43);
        expect(challenge.tokenHash).toBe(hashEmailVerificationToken(challenge.rawToken));
        expect(challenge.tokenHash).not.toContain(challenge.rawToken);
        expect(challenge.sentAt).toBe(now);
        expect(challenge.expiresAt.getTime() - now.getTime()).toBe(EMAIL_VERIFICATION_TTL_MS);
    });

    it('reports resend cooldown only while the current challenge is recent', () => {
        const sentAt = new Date('2026-08-23T00:00:00.000Z');
        const during = new Date(sentAt.getTime() + 12_345);
        const after = new Date(sentAt.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);

        expect(cooldownRemainingSeconds(sentAt, during)).toBe(48);
        expect(cooldownRemainingSeconds(sentAt, after)).toBe(0);
        expect(cooldownRemainingSeconds(null, during)).toBe(0);
    });
});
