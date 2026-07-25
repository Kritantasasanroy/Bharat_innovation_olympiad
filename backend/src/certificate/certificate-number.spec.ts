import {
    CERTIFICATE_NUMBER_PATTERN,
    generateCertificateNumber,
    isValidCertificateNumber,
    RANDOM_PART_LENGTH,
} from './certificate-number';

describe('generateCertificateNumber', () => {
    it('produces the documented BIO-<year>-<10 chars> shape', () => {
        const number = generateCertificateNumber(2026, () => 0);
        expect(number).toMatch(CERTIFICATE_NUMBER_PATTERN);
        expect(number.startsWith('BIO-2026-')).toBe(true);
        expect(number.split('-')[2]).toHaveLength(RANDOM_PART_LENGTH);
    });

    it('is deterministic for a given randomness source', () => {
        const seeded = () => 0.5;
        expect(generateCertificateNumber(2026, seeded)).toBe(generateCertificateNumber(2026, seeded));
    });

    it('never emits the ambiguous characters I, L, O or U', () => {
        // Walk the whole alphabet by sweeping random() across [0,1).
        for (let i = 0; i < 32; i += 1) {
            const number = generateCertificateNumber(2026, () => i / 32);
            const suffix = number.split('-')[2];
            expect(suffix).not.toMatch(/[ILOU]/);
        }
    });

    it('does not collide across many draws with real randomness', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 2000; i += 1) seen.add(generateCertificateNumber(2026));
        expect(seen.size).toBe(2000);
    });

    it('carries the issue year', () => {
        expect(generateCertificateNumber(2031, () => 0)).toContain('-2031-');
    });
});

describe('isValidCertificateNumber', () => {
    it('accepts a freshly generated number', () => {
        expect(isValidCertificateNumber(generateCertificateNumber(2026))).toBe(true);
    });

    it('is case-insensitive and tolerates surrounding whitespace', () => {
        const number = generateCertificateNumber(2026, () => 0);
        expect(isValidCertificateNumber(`  ${number.toLowerCase()}  `)).toBe(true);
    });

    it.each([
        ['empty', ''],
        ['no prefix', '2026-ABCDEFGHJK'],
        ['bad year', 'BIO-26-ABCDEFGHJK'],
        ['too short', 'BIO-2026-ABC'],
        ['too long', 'BIO-2026-ABCDEFGHJKM'],
        ['ambiguous I', 'BIO-2026-IBCDEFGHJK'],
        ['ambiguous O', 'BIO-2026-OBCDEFGHJK'],
        ['sql-ish junk', "BIO-2026-' OR 1=1--"],
    ])('rejects %s', (_label, value) => {
        expect(isValidCertificateNumber(value)).toBe(false);
    });
});
