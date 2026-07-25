/**
 * Standard log/trace envelope (PLAT-02 FR-1, owned here and consumed by
 * PLAT-04 observability/audit).
 *
 * Every service emits structured logs in this shape with a propagated
 * correlation/trace id, so a single request is followable across
 * portal -> core -> proctor.
 */

/** Ordered log severities (ascending). */
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

/** A structured log severity. */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Per-request trace context. `traceId`/`spanId` follow W3C Trace Context hex
 * encoding; `correlationId` is the human-pivotable id surfaced in audit records
 * and {@link ApiError}.
 */
export interface TraceContext {
	/** 32 lowercase-hex chars (W3C trace-id). */
	readonly traceId: string;
	/** 16 lowercase-hex chars (W3C span-id). */
	readonly spanId: string;
	/** Parent span, when this is not a root span. */
	readonly parentSpanId?: string;
	/** Correlation id propagated across services and into audit/error payloads. */
	readonly correlationId: string;
	/** Whether the trace is sampled (W3C sampled flag). */
	readonly sampled?: boolean;
}

/** Redaction-safe error detail attached to a log envelope. */
export interface LogError {
	readonly name: string;
	readonly message: string;
	readonly stack?: string;
}

/**
 * The canonical structured log record. `context` and `error` must already be
 * PII/secret-redacted at the logger boundary (PLAT-04 FR-1).
 */
export interface LogEnvelope {
	readonly level: LogLevel;
	readonly message: string;
	/** ISO-8601 timestamp. */
	readonly timestamp: string;
	/** Emitting service name (e.g. `bio-exam`). */
	readonly service: string;
	readonly trace: TraceContext;
	/** Per-request id (distinct from the cross-service correlation id). */
	readonly requestId?: string;
	readonly context?: Readonly<Record<string, unknown>>;
	readonly error?: LogError;
}

/** Parsed W3C `traceparent` header (version-traceId-parentId-flags). */
export interface Traceparent {
	readonly version: string;
	readonly traceId: string;
	readonly parentId: string;
	readonly flags: string;
}

const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Parse a W3C `traceparent` header value. Returns `null` for malformed input or
 * the all-zero trace/parent ids reserved as invalid by the spec, so callers can
 * fail-closed and mint a fresh root (PLAT-04 FR-3 trace-continuity edge case).
 */
export function parseTraceparent(header: string): Traceparent | null {
	const match = TRACEPARENT_RE.exec(header.trim().toLowerCase());
	if (match === null) {
		return null;
	}
	const [, version, traceId, parentId, flags] = match;
	if (
		version === undefined ||
		traceId === undefined ||
		parentId === undefined ||
		flags === undefined
	) {
		return null;
	}
	// The `ff` version is reserved/invalid; all-zero ids are invalid per spec.
	if (version === "ff" || /^0+$/.test(traceId) || /^0+$/.test(parentId)) {
		return null;
	}
	return { version, traceId, parentId, flags };
}

/** Serialise a {@link Traceparent} back into its header form. */
export function formatTraceparent(tp: Traceparent): string {
	return `${tp.version}-${tp.traceId}-${tp.parentId}-${tp.flags}`;
}
