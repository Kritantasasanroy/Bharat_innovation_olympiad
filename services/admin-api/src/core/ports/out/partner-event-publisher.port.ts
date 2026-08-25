import type { AttributionRule, PartnerStatus } from "../../domain/partner-enums";

/**
 * Domain events emitted by the partner engine (producer `bio-admin`, PRD-046).
 * These are plain domain shapes; the outbound adapter maps them to the
 * `@bio/domain-contracts` wire envelope + validates against the shared Zod
 * schema, so `core` stays free of the contract/zod dependency.
 */
export type PartnerDomainEvent =
	| {
			readonly type: "PartnerApplicationSubmitted";
			readonly applicationId: string;
			readonly partnerId: string;
			readonly orgName: string;
			readonly contactPerson: string;
			readonly email: string;
			readonly submittedAt: Date;
	  }
	| {
			readonly type: "PartnerStatusChanged";
			readonly partnerId: string;
			readonly applicationId: string | undefined;
			readonly previousStatus: PartnerStatus;
			readonly newStatus: PartnerStatus;
			readonly reason: string;
			readonly decidedBy: string;
			readonly decidedAt: Date;
	  }
	| {
			readonly type: "AttributionCredited";
			readonly attributionId: string;
			readonly partnerId: string;
			readonly campaignId: string;
			readonly studentId: string;
			readonly registrationId: string;
			readonly ruleApplied: AttributionRule;
			readonly amountPaise: number;
			readonly convertedAt: Date;
	  }
	| {
			readonly type: "PayoutTriggered";
			readonly payoutId: string;
			readonly partnerId: string;
			readonly amountPaise: number;
			readonly note: string | null;
			readonly triggeredBy: string;
			readonly triggeredAt: Date;
	  }
	| {
			readonly type: "PayoutPaid";
			readonly payoutId: string;
			readonly partnerId: string;
			readonly paidBy: string;
			readonly paidAt: Date;
	  }
	| {
			readonly type: "BankDetailsSubmitted";
			readonly partnerId: string;
			readonly submittedAt: Date;
	  };

/** Outbound port for emitting partner-engine domain events to the cross-service bus. */
export interface PartnerEventPublisher {
	publish(event: PartnerDomainEvent): Promise<void>;
}
