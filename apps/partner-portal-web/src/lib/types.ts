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

export type PayoutStatus = "PENDING" | "FINANCE_REVIEW" | "APPROVED" | "RELEASED" | "ON_HOLD";

export interface StatementRequestInput {
	readonly periodStart: string;
	readonly periodEnd: string;
}

export interface Statement {
	readonly id: string;
	readonly partnerId: string;
	readonly periodStart: string;
	readonly periodEnd: string;
	readonly currency: string;
	readonly totalCommission: number;
	readonly payoutStatus: PayoutStatus;
	readonly financeSignOff: boolean;
	readonly downloadUrl: string | null;
	readonly generatedAt: string;
	readonly releasedAt?: string;
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
