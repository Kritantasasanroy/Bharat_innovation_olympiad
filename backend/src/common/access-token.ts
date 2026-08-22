import * as crypto from 'crypto';
import { getJwtSecret } from './jwt-secret';

/**
 * Access tokens are the credential an approved school or partner uses to sign
 * in. They are bearer secrets, so two properties matter:
 *
 *  - **One token, one holder.** Only the SHA-256 digest is stored, under a
 *    unique index. A login resolves a presented token to exactly one row (or
 *    none), so a token can never authenticate a second organisation.
 *  - **Re-shareable by staff.** Admins need to hand the token to the school
 *    long after approval, so the plaintext is also kept, sealed with AES-256-GCM.
 *    A leaked database dump alone therefore yields no usable tokens.
 *
 * The digest is what authenticates; the sealed copy is only ever opened for an
 * authenticated admin rendering the handover card.
 */

/** Crockford-style: no I, L, O, or U, so a token can be read aloud unambiguously. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 20 symbols over a 32-symbol alphabet = 100 bits of entropy. */
const GROUPS = 4;
const GROUP_LEN = 5;

export type AccessTokenKind = 'SCHOOL' | 'PARTNER';

const PREFIX: Record<AccessTokenKind, string> = {
    SCHOOL: 'BIO-SCH',
    PARTNER: 'BIO-PTR',
};

const BODY = `[0-9A-HJKMNP-TV-Z]{${GROUP_LEN}}`;

export function accessTokenPattern(kind: AccessTokenKind): RegExp {
    return new RegExp(`^${PREFIX[kind]}-${Array(GROUPS).fill(BODY).join('-')}$`);
}

/** The alphabet omits I, L and O; fold them onto what they get misread as. */
const foldBody = (body: string) => body.replace(/O/g, '0').replace(/[IL]/g, '1');

/**
 * Uppercases and folds ambiguous glyphs so a token retyped from a printed card
 * still resolves. The fold is applied to the body only — the `BIO-` prefix
 * itself contains an `I` and an `O`, and folding those would make every token
 * fail its own pattern.
 */
export function normalizeAccessToken(raw: string): string {
    const upper = raw.trim().toUpperCase().replace(/\s+/g, '');
    for (const prefix of Object.values(PREFIX)) {
        if (upper.startsWith(`${prefix}-`)) {
            return `${prefix}-${foldBody(upper.slice(prefix.length + 1))}`;
        }
    }
    return foldBody(upper);
}

export function isValidAccessToken(raw: string, kind: AccessTokenKind): boolean {
    return accessTokenPattern(kind).test(normalizeAccessToken(raw));
}

/** Which kind a token claims to be, by prefix. `null` when it matches neither. */
export function accessTokenKind(raw: string): AccessTokenKind | null {
    const normalized = normalizeAccessToken(raw);
    for (const kind of Object.keys(PREFIX) as AccessTokenKind[]) {
        if (accessTokenPattern(kind).test(normalized)) return kind;
    }
    return null;
}

/**
 * Rejection sampling over whole bytes: 256 is not a multiple of 32, so bytes
 * >= 224 would bias the first eight symbols if taken modulo 32.
 */
export function randomCode(
    length: number,
    randomBytes: (n: number) => Buffer = crypto.randomBytes,
): string {
    const symbols: string[] = [];
    while (symbols.length < length) {
        for (const byte of randomBytes(32)) {
            if (symbols.length === length) break;
            if (byte >= 224) continue; // would bias the distribution
            symbols.push(ALPHABET.charAt(byte % ALPHABET.length));
        }
    }
    return symbols.join('');
}

export function generateAccessToken(
    kind: AccessTokenKind,
    randomBytes: (n: number) => Buffer = crypto.randomBytes,
): string {
    const body = randomCode(GROUPS * GROUP_LEN, randomBytes);
    const groups: string[] = [];
    for (let i = 0; i < GROUPS; i += 1) {
        groups.push(body.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN));
    }
    return `${PREFIX[kind]}-${groups.join('-')}`;
}

/** What we store and index. Normalized first, so lookup is typo-tolerant. */
export function hashAccessToken(raw: string): string {
    return crypto.createHash('sha256').update(normalizeAccessToken(raw), 'utf8').digest('hex');
}

// ── Sealing the plaintext, so staff can re-issue the handover card ───────────

const CIPHER = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * Derived from `ACCESS_TOKEN_KEY` when set, else `JWT_SECRET`. Rotating that
 * secret makes existing sealed tokens unreadable (they still *authenticate* —
 * the digest is independent) and staff must rotate the token to re-issue a card.
 */
function key(): Buffer {
    const secret = process.env.ACCESS_TOKEN_KEY || getJwtSecret();
    return crypto.scryptSync(secret, 'bio-access-token-v1', 32);
}

export function sealAccessToken(plaintext: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(CIPHER, key(), iv);
    const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
        VERSION,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        sealed.toString('base64url'),
    ].join('.');
}

/** `null` when the payload is malformed, truncated, or sealed under another key. */
export function openAccessToken(sealed: string | null | undefined): string | null {
    if (!sealed) return null;
    const [version, iv, tag, payload] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || !payload) return null;
    try {
        const decipher = crypto.createDecipheriv(CIPHER, key(), Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
            decipher.update(Buffer.from(payload, 'base64url')),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        return null;
    }
}
