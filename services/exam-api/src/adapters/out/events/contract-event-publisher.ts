import { randomUUID } from "node:crypto";
import {
	AttemptAutoSubmittedPayload,
	AttemptSubmittedPayload,
	type BioEventEnvelope,
	CONTRACT_VERSION,
} from "@bio/domain-contracts";
import type { EventPublisher, RuntimeDomainEvent } from "../../../core/ports/out";
import { createLogger } from "../../../infra";

const log = createLogger("events");

/**
 * Emits runtime domain events as validated `@bio/domain-contracts` envelopes
 * (producer `bio-exam`). Transport is a structured log line for now — the
 * outbox/event-bus is a later PRD (PLAT-02). Never throws, so event emission
 * cannot break the request path.
 */
export class ContractEventPublisher implements EventPublisher {
	publish(event: RuntimeDomainEvent): Promise<void> {
		try {
			const envelope = this.toEnvelope(event);
			log.info({ eventType: envelope.eventType, envelope }, "runtime event published");
		} catch (error) {
			log.warn({ err: error, type: event.type }, "failed to publish runtime event");
		}
		return Promise.resolve();
	}

	private toEnvelope(event: RuntimeDomainEvent): BioEventEnvelope<unknown> {
		const base = {
			eventId: randomUUID(),
			eventVersion: CONTRACT_VERSION,
			occurredAt: event.submittedAt.toISOString(),
			producer: "bio-exam" as const,
			correlationId: event.attemptId,
			idempotencyKey: `${event.type}:${event.attemptId}`,
		};

		if (event.type === "attempt.submitted") {
			const payload = AttemptSubmittedPayload.parse({
				attemptId: event.attemptId,
				studentId: event.studentId,
				examSnapshotId: event.examSnapshotId,
				submitReason: event.reason,
				answeredCount: event.answeredCount,
				submittedAt: event.submittedAt.toISOString(),
			});
			return { ...base, eventType: "attempt.submitted", payload };
		}

		const payload = AttemptAutoSubmittedPayload.parse({
			attemptId: event.attemptId,
			studentId: event.studentId,
			examSnapshotId: event.examSnapshotId,
			autoSubmitReason: event.reason,
			answeredCount: event.answeredCount,
			submittedAt: event.submittedAt.toISOString(),
		});
		return { ...base, eventType: "attempt.auto_submitted", payload };
	}
}
