/**
 * Certificate numbering (spec Student §27, Admin §21).
 *
 * The number is the *public* identifier: a student shares it, and anyone can
 * check it against the unauthenticated verification endpoint. It therefore has
 * to be unguessable — a sequential counter would let anyone enumerate every
 * certificate ever issued — while still being short enough to read off a page.
 *
 * Format: `BIO-<year>-<10 uppercase base32 chars>`, e.g. `BIO-2026-K3QF7ZX2M9`.
 * The random part carries ~50 bits of entropy. Uniqueness is additionally
 * enforced by a unique constraint on the column; the caller retries on collision.
 *
 * Crockford-style alphabet: no `I`, `L`, `O` or `U`, so the number cannot be
 * misread (1/I, 0/O) or spell anything unfortunate.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RANDOM_PART_LENGTH = 10;
export const CERTIFICATE_NUMBER_PATTERN = /^BIO-\d{4}-[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * @param year   Issue year.
 * @param random Injectable randomness (`[0,1)`), so tests are deterministic.
 */
export function generateCertificateNumber(year: number, random: () => number = Math.random): string {
    let suffix = '';
    for (let i = 0; i < RANDOM_PART_LENGTH; i += 1) {
        const index = Math.floor(random() * ALPHABET.length) % ALPHABET.length;
        suffix += ALPHABET[index];
    }
    return `BIO-${year}-${suffix}`;
}

/** Cheap shape check used to reject junk before hitting the database. */
export function isValidCertificateNumber(value: string): boolean {
    return CERTIFICATE_NUMBER_PATTERN.test(value.trim().toUpperCase());
}
