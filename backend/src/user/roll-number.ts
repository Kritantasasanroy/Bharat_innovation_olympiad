/**
 * Olympiad roll numbering.
 *
 * Format: `BIO<YY>-G<grade>-<5 digits>`, e.g. `BIO26-G8-00123` — season year,
 * grade, then a sequence that restarts per (season, grade).
 *
 * ## Why sequential, and why that is safe here
 *
 * `certificate-number.ts` goes out of its way to be *unguessable*, because a
 * certificate number is public and enumerable numbers would leak every
 * certificate ever issued. A roll number is the opposite kind of identifier: it
 * is quoted down a phone line to support, written on an admit card, and read out
 * in a hall. It has to be short, unambiguous and human-legible, and it is never
 * a credential — nothing is authorised by knowing one. So it is sequential on
 * purpose.
 *
 * ## Why the grade is embedded
 *
 * "Section of student needs to be captured for school level tracking/mapping by
 * teachers/school admin" — a teacher sorting a printed list wants grade visible
 * without a lookup. It is a snapshot of the grade at registration and is *never*
 * rewritten if the student later moves grade: the number is already on issued
 * admit cards and in support history, so mutating it would break the one job it
 * has.
 *
 * ## Season year
 *
 * Two digits of the season, not the calendar year, because an olympiad season
 * that runs across a December–January boundary must not split its roll numbers
 * into two prefixes. `resolveSeasonYear` lets the season be pinned by env.
 */

/** Digits in the sequence part. 5 → 99,999 students per grade per season. */
export const SEQUENCE_DIGITS = 5;

export const ROLL_NUMBER_PATTERN = /^BIO(\d{2})-G(\d{1,2})-(\d{5})$/;

/** Grades the olympiad runs for. Mirrors `CLASS_BANDS` on the frontend. */
export const MIN_GRADE = 1;
export const MAX_GRADE = 12;

export class RollNumberError extends Error {}

/**
 * The counter key a (season, grade) pair draws from. One row in `Sequence` per
 * key, so grades never contend with each other for the same counter.
 */
export function sequenceKeyFor(seasonYear: number, grade: number): string {
    return `roll:${twoDigitYear(seasonYear)}:G${grade}`;
}

/**
 * @param seasonYear Full year (2026) or two-digit (26) — both accepted, since
 *                   the env var and `new Date().getFullYear()` disagree on form.
 * @param grade      1–12.
 * @param sequence   1-based; must fit in `SEQUENCE_DIGITS`.
 */
export function formatRollNumber(seasonYear: number, grade: number, sequence: number): string {
    if (!Number.isInteger(grade) || grade < MIN_GRADE || grade > MAX_GRADE) {
        throw new RollNumberError(`Grade must be an integer ${MIN_GRADE}–${MAX_GRADE}, got ${grade}`);
    }
    if (!Number.isInteger(sequence) || sequence < 1) {
        throw new RollNumberError(`Sequence must be a positive integer, got ${sequence}`);
    }
    const max = 10 ** SEQUENCE_DIGITS - 1;
    if (sequence > max) {
        // Silently rolling over would mint a duplicate, and the unique index
        // would then fail a student's registration with a database error.
        throw new RollNumberError(
            `Sequence ${sequence} exceeds ${max} for grade ${grade} — widen SEQUENCE_DIGITS.`,
        );
    }
    return `BIO${twoDigitYear(seasonYear)}-G${grade}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

export interface ParsedRollNumber {
    seasonYear: number;
    grade: number;
    sequence: number;
}

/** Reads a roll number back apart. Returns null for anything malformed. */
export function parseRollNumber(value: string): ParsedRollNumber | null {
    const match = ROLL_NUMBER_PATTERN.exec(normaliseRollNumber(value));
    if (!match) return null;
    const grade = Number(match[2]);
    if (grade < MIN_GRADE || grade > MAX_GRADE) return null;
    const sequence = Number(match[3]);
    // `BIO26-G8-00000` matches the shape but is not a number we ever issue.
    if (sequence < 1) return null;
    return { seasonYear: Number(match[1]), grade, sequence };
}

export function isValidRollNumber(value: string): boolean {
    return parseRollNumber(value) !== null;
}

/**
 * Canonical form for comparison and lookup: upper-cased, trimmed, and tolerant
 * of the spaces a student types when reading one off a printed card.
 */
export function normaliseRollNumber(value: string): string {
    return value.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * The season to stamp on new roll numbers.
 *
 * `OLYMPIAD_SEASON_YEAR` wins when set, so the season can be pinned across a
 * new-year boundary; otherwise the current calendar year.
 */
export function resolveSeasonYear(
    env: Record<string, string | undefined> = process.env,
    now: Date = new Date(),
): number {
    const raw = env.OLYMPIAD_SEASON_YEAR?.trim();
    if (raw) {
        const parsed = Number(raw);
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return now.getFullYear();
}

function twoDigitYear(year: number): string {
    // Accepts 2026 or 26; anything longer is reduced mod 100.
    const normalised = ((Math.trunc(Math.abs(year)) % 100) + 100) % 100;
    return String(normalised).padStart(2, '0');
}
