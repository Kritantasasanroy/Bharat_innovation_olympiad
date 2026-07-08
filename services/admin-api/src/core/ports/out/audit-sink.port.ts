/**
 * Kind of principal that performed an audited action.
 */
export type AuditActorType = "user" | "service" | "system";

/**
 * Who performed an audited action.
 */
export interface AuditActor {
	/** Stable identifier of the actor (user id, service name, or "system"). */
	id: string;
	/** Category of principal performing the action. */
	type: AuditActorType;
	/** Optional human-readable label (display name, email) for the actor. */
	label?: string | undefined;
}

/**
 * What an audited action affected.
 */
export interface AuditResource {
	/** Domain type of the affected resource (e.g. "exam", "question", "result"). */
	type: string;
	/** Identifier of the affected resource, when one exists. */
	id?: string | undefined;
}

/**
 * Whether the audited action succeeded or failed.
 */
export type AuditOutcome = "success" | "failure";

/**
 * A single, immutable record of a security- or compliance-relevant action.
 *
 * Audit events are append-only facts about something that already happened.
 * They must never carry answer keys, payment secrets, or biometric-sensitive
 * fields — only the metadata needed to reconstruct who did what, to what, and
 * when.
 */
export interface AuditEvent {
	/** Machine-readable action code in dotted form (e.g. "exam.published"). */
	action: string;
	/** Principal that performed the action. */
	actor: AuditActor;
	/** Resource the action affected. */
	resource: AuditResource;
	/** Outcome of the action. */
	outcome: AuditOutcome;
	/** ISO-8601 timestamp of when the action occurred. */
	occurredAt: string;
	/** Correlation/request id for tracing the action across services. */
	correlationId?: string | undefined;
	/** Additional non-sensitive structured context for the event. */
	metadata?: Record<string, unknown> | undefined;
}

/**
 * Output port for the append-only audit trail.
 *
 * Every implementation is append-only: it records new {@link AuditEvent}s and
 * never updates or deletes prior ones. The concrete sink (structured log,
 * durable audit store) is swappable without touching core logic. Until the
 * PLAT-04 audit store lands, an inert log-backed adapter satisfies this port.
 */
export interface AuditSink {
	/**
	 * Append a single audit event to the trail.
	 *
	 * Resolves once the event has been accepted by the sink. Implementations
	 * should treat recording failures as operational errors and surface them
	 * to the caller rather than silently dropping events.
	 */
	record(event: AuditEvent): Promise<void>;
}
