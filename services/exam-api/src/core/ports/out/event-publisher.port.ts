/**
 * Runtime domain events emitted by the exam-window runtime (producer `bio-exam`).
 * These are plain domain shapes; the outbound adapter maps them to the
 * `@bio/domain-contracts` wire envelope + validates against the shared Zod
 * schema, so `core` stays free of the contract/zod dependency.
 */
export type RuntimeDomainEvent =
	| {
			readonly type: "attempt.submitted";
			readonly attemptId: string;
			readonly studentId: string;
			readonly examSnapshotId: string;
			readonly answeredCount: number;
			readonly submittedAt: Date;
			readonly reason: "USER" | "ADMIN_FORCE" | "SYSTEM_RECOVERY";
	  }
	| {
			readonly type: "attempt.auto_submitted";
			readonly attemptId: string;
			readonly studentId: string;
			readonly examSnapshotId: string;
			readonly answeredCount: number;
			readonly submittedAt: Date;
			readonly reason: "TIMER_EXPIRED" | "CONNECTION_LOST" | "SEB_TERMINATED" | "PROCTOR_FORCED";
	  };

/** Outbound port for emitting runtime domain events to the cross-service bus. */
export interface EventPublisher {
	publish(event: RuntimeDomainEvent): Promise<void>;
}
