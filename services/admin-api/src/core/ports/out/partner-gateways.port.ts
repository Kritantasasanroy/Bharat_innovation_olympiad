/** Wall clock — injected so time is deterministic in tests. */
export interface Clock {
	now(): Date;
}

/** Identifier generator (UUID v4) for new aggregate rows. */
export interface IdGenerator {
	uuid(): string;
}
