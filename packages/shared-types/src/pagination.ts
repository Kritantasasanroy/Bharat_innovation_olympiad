/**
 * Cursor-based pagination primitives (PLAT-02 FR-1).
 *
 * Cursor (keyset) pagination is used instead of offset/limit so that large,
 * concurrently-mutated collections (registrations, attempts, proctor events)
 * paginate stably without skipped or duplicated rows.
 */

/** Default page size when a request omits `limit`. */
export const DEFAULT_PAGE_SIZE = 20;

/** Hard upper bound on page size; larger requests are clamped down. */
export const MAX_PAGE_SIZE = 100;

/** A request for one page. `cursor` is an opaque token from a prior {@link Page}. */
export interface PageRequest {
	readonly cursor?: string;
	readonly limit?: number;
}

/** One page of results plus the cursor needed to fetch the next page. */
export interface Page<T> {
	readonly items: readonly T[];
	/** Opaque cursor for the next page, or `null` when the end is reached. */
	readonly nextCursor: string | null;
	readonly hasMore: boolean;
}

/**
 * Normalise a requested page size into `[1, MAX_PAGE_SIZE]`.
 * Missing, non-finite, or out-of-range values fall back to a safe size.
 */
export function resolvePageLimit(limit?: number): number {
	if (limit === undefined || !Number.isFinite(limit)) {
		return DEFAULT_PAGE_SIZE;
	}
	const floored = Math.floor(limit);
	if (floored < 1) {
		return 1;
	}
	if (floored > MAX_PAGE_SIZE) {
		return MAX_PAGE_SIZE;
	}
	return floored;
}

/** Build a {@link Page}; `nextCursor` being non-null implies `hasMore`. */
export function page<T>(items: readonly T[], nextCursor: string | null): Page<T> {
	return { items, nextCursor, hasMore: nextCursor !== null };
}
