import {
    accessTokenKind,
    accessTokenPattern,
    generateAccessToken,
    hashAccessToken,
    isValidAccessToken,
    normalizeAccessToken,
    openAccessToken,
    sealAccessToken,
} from './access-token';

// Seal/open tests need a deterministic key; they never touch live credentials.
process.env.ACCESS_TOKEN_KEY = process.env.ACCESS_TOKEN_KEY || 'unit-test-access-token-key';

describe('generateAccessToken', () => {
    it('emits the documented shape for each kind', () => {
        expect(generateAccessToken('SCHOOL')).toMatch(accessTokenPattern('SCHOOL'));
        expect(generateAccessToken('PARTNER')).toMatch(accessTokenPattern('PARTNER'));
    });

    it('never emits the ambiguous glyphs I, L, O or U', () => {
        const body = Array.from({ length: 200 }, () => generateAccessToken('SCHOOL'))
            .join('')
            .replace(/BIO-SCH/g, '');
        expect(body).not.toMatch(/[ILOU]/);
    });

    it('does not collide across many draws', () => {
        const drawn = new Set(Array.from({ length: 2_000 }, () => generateAccessToken('SCHOOL')));
        expect(drawn.size).toBe(2_000);
    });

    it('rejection-samples so no symbol is over-represented', () => {
        // Bytes 224..255 taken modulo 32 would double the weight of 0..31's
        // first eight symbols. Feed only those and assert we consume more bytes
        // rather than emitting biased output.
        const feed = Buffer.alloc(32, 230);
        let calls = 0;
        const randomBytes = (n: number) => {
            calls += 1;
            // First draw is all-rejected; then hand back a usable, uniform block.
            return calls === 1 ? feed : Buffer.from(Array.from({ length: n }, (_, i) => i));
        };
        const token = generateAccessToken('SCHOOL', randomBytes);
        expect(calls).toBeGreaterThan(1);
        expect(token).toMatch(accessTokenPattern('SCHOOL'));
    });
});

describe('normalizeAccessToken', () => {
    it('folds the omitted glyphs in the body onto what they are misread as', () => {
        expect(normalizeAccessToken('bio-sch-OILOI-ABCDE-ABCDE-ABCDE')).toBe(
            'BIO-SCH-01101-ABCDE-ABCDE-ABCDE',
        );
    });

    it('leaves the prefix alone — it contains an I and an O of its own', () => {
        expect(normalizeAccessToken('bio-sch-ABCDE-ABCDE-ABCDE-ABCDE')).toMatch(/^BIO-SCH-/);
        expect(normalizeAccessToken('bio-ptr-ABCDE-ABCDE-ABCDE-ABCDE')).toMatch(/^BIO-PTR-/);
    });

    it('folds a bare body with no recognised prefix', () => {
        expect(normalizeAccessToken('OIL')).toBe('011');
    });

    it('is insensitive to case and surrounding whitespace', () => {
        const token = generateAccessToken('PARTNER');
        expect(normalizeAccessToken(`  ${token.toLowerCase()}  `)).toBe(token);
    });
});

describe('isValidAccessToken / accessTokenKind', () => {
    it('accepts a freshly generated token of the matching kind only', () => {
        const school = generateAccessToken('SCHOOL');
        expect(isValidAccessToken(school, 'SCHOOL')).toBe(true);
        expect(isValidAccessToken(school, 'PARTNER')).toBe(false);
        expect(accessTokenKind(school)).toBe('SCHOOL');
    });

    it('rejects a token whose body is the wrong length', () => {
        expect(isValidAccessToken('BIO-SCH-ABCD-ABCDE-ABCDE-ABCDE', 'SCHOOL')).toBe(false);
    });

    it('rejects an unknown prefix', () => {
        expect(accessTokenKind('BIO-XXX-ABCDE-ABCDE-ABCDE-ABCDE')).toBeNull();
    });

    it('rejects a JWT — the credential this replaces', () => {
        expect(accessTokenKind('eyJhbGciOi.eyJzdWIi.sig')).toBeNull();
    });
});

describe('hashAccessToken', () => {
    it('is stable across case and spacing, so a printed card can be retyped', () => {
        const token = generateAccessToken('SCHOOL');
        expect(hashAccessToken(` ${token.toLowerCase()} `)).toBe(hashAccessToken(token));
    });

    it('separates two distinct tokens', () => {
        expect(hashAccessToken(generateAccessToken('SCHOOL'))).not.toBe(
            hashAccessToken(generateAccessToken('SCHOOL')),
        );
    });

    it('does not leak the plaintext', () => {
        const token = generateAccessToken('SCHOOL');
        expect(hashAccessToken(token)).not.toContain(token.slice(-5));
    });
});

describe('sealAccessToken / openAccessToken', () => {
    it('round-trips', () => {
        const token = generateAccessToken('SCHOOL');
        expect(openAccessToken(sealAccessToken(token))).toBe(token);
    });

    it('produces a different ciphertext each time (random IV)', () => {
        const token = generateAccessToken('SCHOOL');
        expect(sealAccessToken(token)).not.toBe(sealAccessToken(token));
    });

    it('refuses a payload whose ciphertext was tampered with', () => {
        const sealed = sealAccessToken(generateAccessToken('SCHOOL'));
        const parts = sealed.split('.');
        const flipped = Buffer.from(parts[3], 'base64url');
        flipped[0] ^= 0xff;
        parts[3] = flipped.toString('base64url');
        expect(openAccessToken(parts.join('.'))).toBeNull();
    });

    it('refuses a payload sealed under a different key', () => {
        const original = process.env.ACCESS_TOKEN_KEY;
        process.env.ACCESS_TOKEN_KEY = 'key-one';
        const sealed = sealAccessToken('BIO-SCH-ABCDE-ABCDE-ABCDE-ABCDE');
        process.env.ACCESS_TOKEN_KEY = 'key-two';
        expect(openAccessToken(sealed)).toBeNull();
        process.env.ACCESS_TOKEN_KEY = original;
    });

    it('returns null rather than throwing on malformed input', () => {
        expect(openAccessToken(null)).toBeNull();
        expect(openAccessToken(undefined)).toBeNull();
        expect(openAccessToken('')).toBeNull();
        expect(openAccessToken('garbage')).toBeNull();
        expect(openAccessToken('v9.a.b.c')).toBeNull();
    });
});
