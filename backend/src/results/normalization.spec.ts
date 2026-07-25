import {
    mean,
    normalizeScores,
    RawAttemptScore,
    standardDeviation,
    TARGET_MEAN,
    TARGET_SD,
} from './normalization';

const attempt = (id: string, rawScore: number, maxScore = 100): RawAttemptScore => ({
    id,
    rawScore,
    maxScore,
});

describe('mean / standardDeviation', () => {
    it('returns 0 for an empty set rather than NaN', () => {
        expect(mean([])).toBe(0);
        expect(standardDeviation([])).toBe(0);
    });

    it('computes the population standard deviation (divides by N, not N-1)', () => {
        // values 2,4,4,4,5,5,7,9 -> mean 5, population sd 2 (sample sd would be ~2.138)
        expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
        expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    });
});

describe('normalizeScores', () => {
    it('returns an empty array for an empty cohort', () => {
        expect(normalizeScores([])).toEqual([]);
    });

    it('leaves a zero-variance cohort untouched instead of collapsing it to the target mean', () => {
        // Everyone scored 100%. Rescaling would silently rewrite them to 50%.
        const results = normalizeScores([attempt('a', 100), attempt('b', 100), attempt('c', 100)]);
        expect(results.map((r) => r.normalizedScore)).toEqual([100, 100, 100]);
        // Tied cohort: everyone shares rank 1 and sits at the median percentile.
        expect(results.map((r) => r.rank)).toEqual([1, 1, 1]);
        expect(results.map((r) => r.percentile)).toEqual([50, 50, 50]);
    });

    it('places a lone candidate at the 50th percentile with rank 1 and an unchanged score', () => {
        const [only] = normalizeScores([attempt('solo', 73)]);
        expect(only).toEqual({ id: 'solo', normalizedScore: 73, percentile: 50, rank: 1 });
    });

    it('maps the cohort mean onto TARGET_MEAN and one sd onto TARGET_SD', () => {
        // pct = 0.4, 0.5, 0.6 -> mean 0.5, population sd ~0.08165
        const results = normalizeScores([attempt('lo', 40), attempt('mid', 50), attempt('hi', 60)]);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));

        // The mean attempt lands exactly on the target mean.
        expect(byId.mid.normalizedScore).toBeCloseTo(TARGET_MEAN * 100, 6);

        // The others are symmetric about it, and z = ±1.2247 here.
        const z = (0.6 - 0.5) / standardDeviation([0.4, 0.5, 0.6]);
        expect(byId.hi.normalizedScore).toBeCloseTo((TARGET_MEAN + TARGET_SD * z) * 100, 2);
        expect(byId.lo.normalizedScore).toBeCloseTo((TARGET_MEAN - TARGET_SD * z) * 100, 2);
    });

    it('preserves the ordering of raw scores', () => {
        const results = normalizeScores([attempt('a', 10), attempt('b', 90), attempt('c', 50)]);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));
        expect(byId.b.normalizedScore).toBeGreaterThan(byId.c.normalizedScore);
        expect(byId.c.normalizedScore).toBeGreaterThan(byId.a.normalizedScore);
        expect([byId.b.rank, byId.c.rank, byId.a.rank]).toEqual([1, 2, 3]);
    });

    it('clamps extreme outliers into [0, maxScore] rather than emitting negative or >max marks', () => {
        // One huge outlier drags the mean up and pushes the rest far below zero pre-clamp.
        const results = normalizeScores([
            attempt('zero', 0),
            attempt('zero2', 0),
            attempt('zero3', 0),
            attempt('outlier', 100),
        ]);
        for (const result of results) {
            expect(result.normalizedScore).toBeGreaterThanOrEqual(0);
            expect(result.normalizedScore).toBeLessThanOrEqual(100);
        }
        const outlier = results.find((r) => r.id === 'outlier')!;
        expect(outlier.rank).toBe(1);
    });

    it('compares attempts fairly across different maxScore totals', () => {
        // 45/50 (90%) must outrank 80/100 (80%) even though 80 > 45 in raw marks.
        const results = normalizeScores([attempt('short', 45, 50), attempt('long', 80, 100)]);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));
        expect(byId.short.rank).toBe(1);
        expect(byId.long.rank).toBe(2);
    });

    it('reports normalizedScore in each attempt-s own maxScore scale', () => {
        const results = normalizeScores([attempt('short', 45, 50), attempt('long', 80, 100)]);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));
        expect(byId.short.normalizedScore).toBeLessThanOrEqual(50);
        expect(byId.long.normalizedScore).toBeLessThanOrEqual(100);
    });

    it('gives tied attempts the same rank and consumes the following ranks (competition ranking)', () => {
        const results = normalizeScores([
            attempt('a', 90),
            attempt('b', 90),
            attempt('c', 50),
            attempt('d', 10),
        ]);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));
        expect(byId.a.rank).toBe(1);
        expect(byId.b.rank).toBe(1);
        expect(byId.c.rank).toBe(3); // rank 2 is consumed by the tie
        expect(byId.d.rank).toBe(4);
    });

    it('uses the textbook percentile rank (L + 0.5E)/N', () => {
        const results = normalizeScores([
            attempt('a', 90),
            attempt('b', 90),
            attempt('c', 50),
            attempt('d', 10),
        ]);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));
        // top pair: L=2, E=2, N=4 -> (2 + 1)/4 = 75
        expect(byId.a.percentile).toBe(75);
        expect(byId.b.percentile).toBe(75);
        // middle: L=1, E=1 -> (1 + 0.5)/4 = 37.5
        expect(byId.c.percentile).toBe(37.5);
        // bottom: L=0, E=1 -> 0.5/4 = 12.5
        expect(byId.d.percentile).toBe(12.5);
    });

    it('treats a non-positive maxScore as 0% instead of dividing by zero', () => {
        const results = normalizeScores([attempt('bad', 10, 0), attempt('ok', 50, 100)]);
        expect(results.every((r) => Number.isFinite(r.normalizedScore))).toBe(true);
        expect(results.find((r) => r.id === 'bad')!.normalizedScore).toBe(0);
    });

    it('clamps a raw score above maxScore to 100% rather than exceeding the scale', () => {
        const results = normalizeScores([attempt('over', 150, 100), attempt('under', 50, 100)]);
        const over = results.find((r) => r.id === 'over')!;
        expect(over.normalizedScore).toBeLessThanOrEqual(100);
        expect(over.rank).toBe(1);
    });

    it('returns results in input order', () => {
        const results = normalizeScores([attempt('x', 10), attempt('y', 90), attempt('z', 50)]);
        expect(results.map((r) => r.id)).toEqual(['x', 'y', 'z']);
    });

    it('is deterministic — the same cohort normalizes identically twice', () => {
        const cohort = [attempt('a', 12), attempt('b', 77), attempt('c', 43)];
        expect(normalizeScores(cohort)).toEqual(normalizeScores(cohort));
    });
});
