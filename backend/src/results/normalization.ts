/**
 * Fair-score processing (spec Admin §19 — "Normalization").
 *
 * Students sitting the same exam instance receive *different* question sets
 * (the seeded per-student selection), so raw marks are not directly comparable:
 * one student's set may simply have been harder. Normalization maps every raw
 * score onto a common scale so that a mark means the same thing for everyone.
 *
 * The transform is a z-score rescale, computed in *percentage* space so that
 * attempts with different `maxScore` values are comparable:
 *
 *     pct   = rawScore / maxScore
 *     z     = (pct - mean(pct)) / sd(pct)
 *     pct'  = clamp(TARGET_MEAN + TARGET_SD * z, 0, 1)
 *     score' = pct' * maxScore
 *
 * Deliberate choices:
 *  - **Zero variance is left alone.** If every attempt scored the same, there
 *    is no relative information to extract; forcing everyone to TARGET_MEAN
 *    would silently rewrite a perfect 100% into a 50%. We return the raw
 *    percentage unchanged.
 *  - **Population (not sample) standard deviation**, because we normalize over
 *    the whole cohort that sat the instance, not a sample of it.
 *  - **Ranking is done on the normalized percentage**, not on `normalizedScore`,
 *    because two attempts with different `maxScore` can order differently in
 *    raw-score space than they do on the common scale.
 *  - Percentile is the textbook percentile *rank*: `(L + 0.5E) / N * 100`,
 *    which puts a lone candidate at 50 and the best of many just under 100.
 *  - Rank is competition ranking (`1224`): ties share a rank and consume the
 *    slots after them.
 *
 * This module is deliberately pure (no Prisma, no I/O) so the maths can be
 * unit-tested exhaustively.
 */

/** Where the cohort's mean lands on the normalized scale (50% of max marks). */
export const TARGET_MEAN = 0.5;
/** One standard deviation on the normalized scale (15% of max marks). */
export const TARGET_SD = 0.15;

export interface RawAttemptScore {
    readonly id: string;
    /** Marks awarded. Treated as 0 when null/undefined. */
    readonly rawScore: number;
    /** Marks available to *this* attempt. A non-positive value yields 0%. */
    readonly maxScore: number;
}

export interface NormalizedAttemptScore {
    readonly id: string;
    /** Rescaled marks, in the attempt's own `maxScore` scale, rounded to 2dp. */
    readonly normalizedScore: number;
    /** Textbook percentile rank over the cohort, 0..100, rounded to 2dp. */
    readonly percentile: number;
    /** Competition rank (1-based); tied attempts share a rank. */
    readonly rank: number;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/** Fraction of `maxScore` achieved. Guards divide-by-zero and negative marks. */
function toPercentage(attempt: RawAttemptScore): number {
    if (!Number.isFinite(attempt.maxScore) || attempt.maxScore <= 0) return 0;
    const raw = Number.isFinite(attempt.rawScore) ? attempt.rawScore : 0;
    return clamp01(raw / attempt.maxScore);
}

export function mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation. */
export function standardDeviation(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const m = mean(values);
    const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Normalize a cohort of attempts. Order of the returned array matches the input.
 * An empty cohort yields an empty result.
 */
export function normalizeScores(attempts: readonly RawAttemptScore[]): NormalizedAttemptScore[] {
    const n = attempts.length;
    if (n === 0) return [];

    const percentages = attempts.map(toPercentage);
    const m = mean(percentages);
    const sd = standardDeviation(percentages);

    // Zero variance: nothing to rescale — keep the cohort exactly as it was.
    const normalizedPct =
        sd === 0
            ? percentages.slice()
            : percentages.map((pct) => clamp01(TARGET_MEAN + TARGET_SD * ((pct - m) / sd)));

    return attempts.map((attempt, index) => {
        const pct = normalizedPct[index];
        const strictlyGreater = normalizedPct.filter((other) => other > pct).length;
        const strictlyLess = normalizedPct.filter((other) => other < pct).length;
        const equal = normalizedPct.filter((other) => other === pct).length;

        return {
            id: attempt.id,
            normalizedScore: round2(pct * Math.max(attempt.maxScore, 0)),
            percentile: round2(((strictlyLess + 0.5 * equal) / n) * 100),
            rank: strictlyGreater + 1,
        };
    });
}
