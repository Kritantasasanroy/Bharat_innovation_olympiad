/**
 * DTOs mirroring `services/portal-api`'s outbound port
 * (`services/portal-api/src/core/ports/out/admin-api-client.port.ts`) and
 * support-request port. Duplicated here rather than imported from a shared
 * package: there is no published `@bio/portal-contract-fixtures` DTO surface
 * yet (that package is currently a placeholder — see
 * `packages/portal-contract-fixtures/src/contract.test.ts`), so this file is
 * the seam to update if/when one lands. Keep in sync with portal-api's port
 * types by hand until then.
 */

export type PartnerApplicationStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export interface PartnerApplicationInput {
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
}

export interface PartnerApplication {
	readonly partnerId: string;
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
	readonly status: PartnerApplicationStatus;
	readonly submittedAt: string;
	readonly decidedAt?: string;
}

/**
 * An institution staff have assigned to this partner. The engine does not key
 * attribution by institution, so there are deliberately no per-institution
 * funnel counts — showing fabricated ones would be worse than showing none.
 */
export interface AssignedInstitution {
	readonly institutionId: string;
	readonly effectiveFrom: string;
	readonly effectiveTo: string | null;
}

export interface CampaignFunnelBreakdown {
	readonly campaignId: string;
	readonly name: string;
	readonly code: string;
	readonly shareUrl: string;
	/** Same code, pointed at the school portal — onboards schools. */
	readonly schoolShareUrl: string;
	readonly status: CampaignStatus;
	readonly signups: number;
	readonly registrations: number;
	readonly paid: number;
}

export interface PartnerFunnel {
	readonly partnerId: string;
	readonly totals: {
		readonly signups: number;
		readonly registrations: number;
		readonly paid: number;
	};
	readonly campaigns: readonly CampaignFunnelBreakdown[];
	readonly generatedAt: string;
}

/** Mirrors the engine's CampaignStatus exactly. */
export type CampaignStatus = "ACTIVE" | "DEACTIVATED";

export interface CampaignInput {
	readonly name: string;
	readonly institutionId?: string;
}

export interface CampaignUpdateInput {
	readonly name?: string;
	readonly status?: CampaignStatus;
}

export interface Campaign {
	readonly id: string;
	readonly partnerId: string;
	readonly name: string;
	readonly code: string;
	readonly shareUrl: string;
	readonly status: CampaignStatus;
	readonly createdAt: string;
}

/**
 * No fixed commission: admin decides an amount and triggers it directly
 * against the partner (TRIGGERED), then marks it paid once the money has
 * actually gone out (PAID). Terminal at PAID.
 */
export type PayoutStatus = "TRIGGERED" | "PAID";

export interface Payout {
	readonly id: string;
	readonly partnerId: string;
	readonly amountPaise: number;
	/** What this covers, freeform — e.g. "August referrals". */
	readonly note: string | null;
	readonly status: PayoutStatus;
	readonly triggeredBy: string;
	readonly triggeredAt: string;
	readonly paidBy: string | null;
	readonly paidAt: string | null;
}

/**
 * Where this partner's payouts get sent. Account number and PAN are the only
 * two fields encrypted at rest — this shape carries only their masked
 * companions unless the read explicitly reveals them (the partner's own read
 * always does; it's already theirs).
 */
export interface BankDetails {
	readonly partnerId: string;
	readonly accountHolderName: string;
	readonly bankName: string;
	readonly ifscCode: string;
	readonly accountNumberLast4: string;
	readonly panMasked: string;
	readonly submittedAt: string;
	readonly updatedAt: string;
	readonly accountNumber?: string;
	readonly pan?: string;
}

export interface SubmitBankDetailsInput {
	readonly accountHolderName: string;
	readonly bankName: string;
	readonly ifscCode: string;
	readonly accountNumber: string;
	readonly pan: string;
}

export type SupportRequestCategory = "CAMPAIGN" | "PRICING" | "OTHER";
export type SupportRequestStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export interface SupportRequestInput {
	readonly category: SupportRequestCategory;
	readonly subject: string;
	readonly message: string;
}

export interface SupportRequest {
	readonly id: string;
	readonly partnerId: string;
	readonly category: SupportRequestCategory;
	readonly subject: string;
	readonly message: string;
	readonly status: SupportRequestStatus;
	readonly createdAt: string;
}
