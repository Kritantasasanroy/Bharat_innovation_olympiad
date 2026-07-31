import {
    formatRollNumber,
    isValidRollNumber,
    normaliseRollNumber,
    parseRollNumber,
    resolveSeasonYear,
    RollNumberError,
    ROLL_NUMBER_PATTERN,
    SEQUENCE_DIGITS,
    sequenceKeyFor,
} from './roll-number';

describe('formatRollNumber', () => {
    it('produces the documented BIO<YY>-G<grade>-<5 digits> shape', () => {
        const roll = formatRollNumber(2026, 8, 123);
        expect(roll).toBe('BIO26-G8-00123');
        expect(roll).toMatch(ROLL_NUMBER_PATTERN);
    });

    it('accepts either a full or a two-digit season year', () => {
        expect(formatRollNumber(2026, 8, 1)).toBe('BIO26-G8-00001');
        expect(formatRollNumber(26, 8, 1)).toBe('BIO26-G8-00001');
    });

    it('zero-pads the sequence to a fixed width so numbers sort lexically', () => {
        const rolls = [1, 2, 10, 99, 1000].map((n) => formatRollNumber(2026, 7, n));
        expect(rolls).toEqual([
            'BIO26-G7-00001',
            'BIO26-G7-00002',
            'BIO26-G7-00010',
            'BIO26-G7-00099',
            'BIO26-G7-01000',
        ]);
        // The point of the padding: string sort === numeric sort.
        expect([...rolls].sort()).toEqual(rolls);
    });

    it('keeps grades in their own number space', () => {
        expect(formatRollNumber(2026, 6, 1)).toBe('BIO26-G6-00001');
        expect(formatRollNumber(2026, 12, 1)).toBe('BIO26-G12-00001');
    });

    it.each([0, 13, -1, 1.5, NaN])('rejects out-of-range grade %s', (grade) => {
        expect(() => formatRollNumber(2026, grade as number, 1)).toThrow(RollNumberError);
    });

    it.each([0, -1, 2.5])('rejects non-positive-integer sequence %s', (seq) => {
        expect(() => formatRollNumber(2026, 8, seq as number)).toThrow(RollNumberError);
    });

    it('refuses to roll over rather than minting a duplicate', () => {
        const max = 10 ** SEQUENCE_DIGITS - 1;
        expect(formatRollNumber(2026, 8, max)).toBe('BIO26-G8-99999');
        // Overflowing would wrap back to a number already issued, and the unique
        // index would fail a real student's registration.
        expect(() => formatRollNumber(2026, 8, max + 1)).toThrow(/exceeds/);
    });
});

describe('parseRollNumber', () => {
    it('round-trips a formatted number', () => {
        expect(parseRollNumber(formatRollNumber(2026, 8, 123))).toEqual({
            seasonYear: 26,
            grade: 8,
            sequence: 123,
        });
    });

    it('round-trips a two-digit grade', () => {
        expect(parseRollNumber('BIO26-G11-00007')).toEqual({
            seasonYear: 26,
            grade: 11,
            sequence: 7,
        });
    });

    it.each([
        ['empty', ''],
        ['no prefix', '26-G8-00123'],
        ['four-digit year', 'BIO2026-G8-00123'],
        ['missing grade marker', 'BIO26-8-00123'],
        ['grade 0', 'BIO26-G0-00123'],
        ['grade 13', 'BIO26-G13-00123'],
        ['sequence 0', 'BIO26-G8-00000'],
        ['short sequence', 'BIO26-G8-123'],
        ['long sequence', 'BIO26-G8-000123'],
        ['certificate number', 'BIO-2026-K3QF7ZX2M9'],
        ['sql-ish junk', "BIO26-G8-' OR 1=1--"],
    ])('rejects %s', (_label, value) => {
        expect(parseRollNumber(value)).toBeNull();
        expect(isValidRollNumber(value)).toBe(false);
    });

    it('tolerates the casing and spacing a student types off a printed card', () => {
        expect(isValidRollNumber('  bio26-g8-00123 ')).toBe(true);
        expect(normaliseRollNumber(' bio26 - g8 - 00123 ')).toBe('BIO26-G8-00123');
    });
});

describe('sequenceKeyFor', () => {
    it('gives each grade in each season its own counter', () => {
        expect(sequenceKeyFor(2026, 8)).toBe('roll:26:G8');
        expect(sequenceKeyFor(2027, 8)).toBe('roll:27:G8');
        expect(sequenceKeyFor(2026, 9)).toBe('roll:26:G9');
    });

    it('is stable whether given a full or two-digit year', () => {
        expect(sequenceKeyFor(2026, 8)).toBe(sequenceKeyFor(26, 8));
    });
});

describe('resolveSeasonYear', () => {
    it('defaults to the current calendar year', () => {
        expect(resolveSeasonYear({}, new Date('2026-07-30T00:00:00Z'))).toBe(2026);
    });

    it('lets the season be pinned across a new-year boundary', () => {
        // A season running Nov 2026 → Feb 2027 must not split its roll numbers.
        expect(
            resolveSeasonYear({ OLYMPIAD_SEASON_YEAR: '2026' }, new Date('2027-01-15T00:00:00Z')),
        ).toBe(2026);
    });

    it.each([['blank', '  '], ['junk', 'abc'], ['zero', '0'], ['negative', '-5']])(
        'falls back to the calendar year for %s env values',
        (_label, raw) => {
            expect(resolveSeasonYear({ OLYMPIAD_SEASON_YEAR: raw }, new Date('2026-05-01Z'))).toBe(2026);
        },
    );
});
