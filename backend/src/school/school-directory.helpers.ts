/**
 * Pure helpers for the school directory: how a school name is normalised for
 * duplicate detection, and how a school code typed by a student is resolved.
 */

/**
 * The duplicate key. Two rows with the same `schoolNameKey` and pincode are the
 * same school, however they were punctuated or capitalised:
 *
 *   "St. Xavier's High School"  ->  "st xaviers high school"
 *   "ST XAVIERS  HIGH SCHOOL"   ->  "st xaviers high school"
 *
 * Apostrophes are dropped rather than turned into separators, so "Xavier's"
 * and "Xaviers" agree. Everything else non-alphanumeric collapses to a space.
 */
export function schoolNameKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/['’`]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** A pincode is exactly six digits, and never starts with a zero in India. */
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export function isValidPincode(raw: string): boolean {
	return PINCODE_PATTERN.test(raw.trim());
}

/** School codes are `SCH-` + 6 symbols of the unambiguous alphabet (no I/L/O/U). */
export const SCHOOL_CODE_PATTERN = /^SCH-[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * Students type their school code off a printed card or a forwarded message, so
 * matching must be forgiving: case is irrelevant, whitespace is stripped, a
 * missing hyphen is tolerated, and the glyphs the alphabet omits are folded onto
 * the characters they get misread as. The `SCH` prefix is left alone — it
 * contains no ambiguous glyph, and folding a prefix is how the access-token
 * normaliser first went wrong.
 */
export function normalizeSchoolCode(raw: string): string {
	const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
	if (!compact.startsWith('SCH')) return compact;
	const body = compact
		.slice(3)
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	return `SCH-${body}`;
}

export function isValidSchoolCode(raw: string): boolean {
	return SCHOOL_CODE_PATTERN.test(normalizeSchoolCode(raw));
}
