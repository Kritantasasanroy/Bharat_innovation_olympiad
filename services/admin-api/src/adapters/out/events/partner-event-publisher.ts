import { randomUUID } from "node:crypto";
import {
	AttributionCreditedPayload,
	BankDetailsSubmittedPayload,
	type BioEventEnvelope,
	CONTRACT_VERSION,
	PartnerApplicationSubmittedPayload,
	PartnerStatusChangedPayload,
	PayoutPaidPayload,
	PayoutTriggeredPayload,
} from "@bio/domain-contracts";
import type {
	PartnerDomainEvent,
	PartnerEventPublisher,
} from "../../../core/ports/out/partner-event-publisher.port";
import { createLogger } from "../../../infra";

const log = createLogger("partner-events");

/**
 * Emits partner-engine domain events as validated `@bio/domain-contracts`
 * envelopes (producer `bio-admin`). Transport is a structured log line for
 * now — the outbox/event-bus is a later PRD (PLAT-02) — mirrors
 * `services/exam-api`'s `ContractEventPublisher`. Never throws, so event
 * emission cannot break the request path.
 */
export class ContractPartnerEventPublisher implements PartnerEventPublisher {
	publish(event: PartnerDomainEvent): Promise<void> {
		try {
			const envelope = this.toEnvelope(event);
			log.info({ eventType: envelope.eventType, envelope }, "partner event published");
		} catch (error) {
			log.warn({ err: error, type: event.type }, "failed to publish partner event");
		}
		return Promise.resolve();
	}

	private toEnvelope(event: PartnerDomainEvent): BioEventEnvelope<unknown> {
		const base = {
			eventId: randomUUID(),
			eventVersion: CONTRACT_VERSION,
			producer: "bio-admin" as const,
		};

		switch (event.type) {
			case "PartnerApplicationSubmitted": {
				const payload = PartnerApplicationSubmittedPayload.parse({
					applicationId: event.applicationId,
					partnerId: event.partnerId,
					orgName: event.orgName,
					contactPerson: event.contactPerson,
					email: event.email,
					submittedAt: event.submittedAt.toISOString(),
				});
				return {
					...base,
					eventType: "PartnerApplicationSubmitted",
					occurredAt: event.submittedAt.toISOString(),
					correlationId: event.applicationId,
					idempotencyKey: `PartnerApplicationSubmitted:${event.applicationId}`,
					payload,
				};
			}
			case "PartnerStatusChanged": {
				const payload = PartnerStatusChangedPayload.parse({
					partnerId: event.partnerId,
					applicationId: event.applicationId,
					previousStatus: event.previousStatus,
					newStatus: event.newStatus,
					reason: event.reason,
					decidedBy: event.decidedBy,
					decidedAt: event.decidedAt.toISOString(),
				});
				return {
					...base,
					eventType: "PartnerStatusChanged",
					occurredAt: event.decidedAt.toISOString(),
					correlationId: event.partnerId,
					idempotencyKey: `PartnerStatusChanged:${event.partnerId}:${event.newStatus}`,
					payload,
				};
			}
			case "AttributionCredited": {
				const payload = AttributionCreditedPayload.parse({
					attributionId: event.attributionId,
					partnerId: event.partnerId,
					campaignId: event.campaignId,
					studentId: event.studentId,
					registrationId: event.registrationId,
					ruleApplied: event.ruleApplied,
					amountPaise: event.amountPaise,
					convertedAt: event.convertedAt.toISOString(),
				});
				return {
					...base,
					eventType: "AttributionCredited",
					occurredAt: event.convertedAt.toISOString(),
					correlationId: event.attributionId,
					idempotencyKey: `AttributionCredited:${event.studentId}:${event.registrationId}`,
					payload,
				};
			}
			case "PayoutTriggered": {
				const payload = PayoutTriggeredPayload.parse({
					payoutId: event.payoutId,
					partnerId: event.partnerId,
					amountPaise: event.amountPaise,
					note: event.note,
					triggeredBy: event.triggeredBy,
					triggeredAt: event.triggeredAt.toISOString(),
				});
				return {
					...base,
					eventType: "PayoutTriggered",
					occurredAt: event.triggeredAt.toISOString(),
					correlationId: event.payoutId,
					idempotencyKey: `PayoutTriggered:${event.payoutId}`,
					payload,
				};
			}
			case "PayoutPaid": {
				const payload = PayoutPaidPayload.parse({
					payoutId: event.payoutId,
					partnerId: event.partnerId,
					paidBy: event.paidBy,
					paidAt: event.paidAt.toISOString(),
				});
				return {
					...base,
					eventType: "PayoutPaid",
					occurredAt: event.paidAt.toISOString(),
					correlationId: event.payoutId,
					idempotencyKey: `PayoutPaid:${event.payoutId}`,
					payload,
				};
			}
			case "BankDetailsSubmitted": {
				const payload = BankDetailsSubmittedPayload.parse({
					partnerId: event.partnerId,
					submittedAt: event.submittedAt.toISOString(),
				});
				return {
					...base,
					eventType: "BankDetailsSubmitted",
					occurredAt: event.submittedAt.toISOString(),
					correlationId: event.partnerId,
					idempotencyKey: `BankDetailsSubmitted:${event.partnerId}:${event.submittedAt.toISOString()}`,
					payload,
				};
			}
		}
	}
}
