import type { AuditEvent, AuditSink } from "../../../core/ports/out/audit-sink.port.ts";
import { createLogger, type Logger } from "../../../infra";

/** Log message used to mark a structured audit envelope. */
export const AUDIT_LOG_EVENT = "audit.event";

/**
 * Inert {@link AuditSink} that records events via the structured log envelope.
 *
 * This adapter does not persist anything durably; it emits each event as a
 * structured log line under the `audit` key so the trail is observable in
 * shipped logs. It is a placeholder until the PLAT-04 audit store lands, at
 * which point a durable adapter replaces it behind the same port.
 */
export class NoopAuditSink implements AuditSink {
	readonly #log: Logger;

	constructor(log: Logger = createLogger("audit-sink")) {
		this.#log = log;
	}

	record(event: AuditEvent): Promise<void> {
		this.#log.info({ audit: event }, AUDIT_LOG_EVENT);
		return Promise.resolve();
	}
}

/**
 * Construct the inert log-backed {@link AuditSink}.
 *
 * @param log Optional logger to record through; defaults to a child logger
 *   bound to the `audit-sink` component.
 */
export function createNoopAuditSink(log?: Logger): AuditSink {
	return new NoopAuditSink(log);
}
