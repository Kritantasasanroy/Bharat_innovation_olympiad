import type { ExamInstanceView } from "../../domain/models";

/** Wall clock — injected so time is deterministic in tests. */
export interface Clock {
	now(): Date;
}

/** Identifier generator (UUID v4) for new aggregate rows. */
export interface IdGenerator {
	uuid(): string;
}

/**
 * Outbound port for the attempt-start entitlement gate (PRD EXAM-02).
 *
 * Enforces, independent of any frontend check:
 *  - Face enrollment exists (throws FaceEnrollmentRequiredError), and
 *  - A CONFIRMED slot booking within its window when the instance has slots
 *    (throws EntitlementError).
 * Demo exams bypass the slot gate.
 */
export interface EntitlementGate {
	assertCanStart(userId: string, instance: ExamInstanceView, isDemo: boolean): Promise<void>;
}

/**
 * Durable timer store (PRD EXAM-04). Deadlines survive process restarts; on a
 * cache miss the service recomputes from the persisted attempt start time.
 */
export interface TimerStore {
	/** Persist the absolute deadline (epoch ms) for an attempt. */
	setDeadline(attemptId: string, deadlineMs: number, ttlSecs: number): Promise<void>;
	/** Read the absolute deadline (epoch ms), or null on cache miss. */
	getDeadline(attemptId: string): Promise<number | null>;
	clear(attemptId: string): Promise<void>;
}
