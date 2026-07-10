import {
    isValidPincode,
    isValidSchoolCode,
    normalizeSchoolCode,
    schoolNameKey,
} from './school-directory.helpers';

describe('schoolNameKey', () => {
    it('collapses the ways one school gets typed into a single key', () => {
        const variants = [
            "St. Xavier's High School",
            'ST XAVIERS  HIGH SCHOOL',
            'st. xaviers high-school',
            '  St Xavier’s   High School  ',
        ];
        const keys = new Set(variants.map(schoolNameKey));
        expect(keys.size).toBe(1);
        expect([...keys][0]).toBe('st xaviers high school');
    });

    it('keeps genuinely different schools apart', () => {
        expect(schoolNameKey('DPS Nagpur')).not.toBe(schoolNameKey('DPS Mumbai'));
    });

    it('does not merge a name into the empty string', () => {
        expect(schoolNameKey('डीपीएस')).toBe('');
        // Non-latin names normalise away entirely; the pincode still separates
        // them, and the empty key is a known limitation, not a silent collision.
    });
});

describe('isValidPincode', () => {
    it('accepts a six-digit Indian pincode', () => {
        expect(isValidPincode('441108')).toBe(true);
        expect(isValidPincode(' 110001 ')).toBe(true);
    });

    it('rejects the wrong length, a leading zero, and non-digits', () => {
        expect(isValidPincode('44110')).toBe(false);
        expect(isValidPincode('4411080')).toBe(false);
        expect(isValidPincode('041108')).toBe(false);
        expect(isValidPincode('44110a')).toBe(false);
        expect(isValidPincode('')).toBe(false);
    });
});

describe('normalizeSchoolCode', () => {
    it('is case-insensitive and ignores spacing', () => {
        expect(normalizeSchoolCode('  sch-1t8gmh ')).toBe('SCH-1T8GMH');
    });

    it('tolerates a missing hyphen', () => {
        expect(normalizeSchoolCode('SCH1T8GMH')).toBe('SCH-1T8GMH');
    });

    it('folds the glyphs the alphabet omits onto what they are misread as', () => {
        expect(normalizeSchoolCode('SCH-O1LIO2')).toBe('SCH-011102');
    });

    it('leaves the SCH prefix alone', () => {
        // The prefix has no ambiguous glyph; folding a prefix is the bug that
        // once made every access token fail its own pattern.
        expect(normalizeSchoolCode('sch-ABCDEF')).toMatch(/^SCH-/);
    });

    it('passes through something that is not a school code, unchanged in shape', () => {
        expect(normalizeSchoolCode('hello')).toBe('HELLO');
    });
});

describe('isValidSchoolCode', () => {
    it('accepts a real code however it was typed', () => {
        for (const typed of ['SCH-1T8GMH', 'sch1t8gmh', ' SCH-1T8GMH ']) {
            expect(isValidSchoolCode(typed)).toBe(true);
        }
    });

    it('rejects the wrong length and an unknown prefix', () => {
        expect(isValidSchoolCode('SCH-1T8GM')).toBe(false);
        expect(isValidSchoolCode('SCH-1T8GMHX')).toBe(false);
        expect(isValidSchoolCode('SCH001')).toBe(false); // the old static-JSON shape
        expect(isValidSchoolCode('BIO-SCH-ABCDE-ABCDE-ABCDE-ABCDE')).toBe(false);
    });

    it('rejects an empty or blank code', () => {
        expect(isValidSchoolCode('')).toBe(false);
        expect(isValidSchoolCode('   ')).toBe(false);
    });
});
