/**
 * Outbound port to the `admin-api` partner engine (PRD-046).
 *
 * `services/portal-api` is a thin BFF: attribution rules, commission math,
 * statement generation, and payout processing all live in `admin-api`. This
 * port is the *only* seam through which portal-api's HTTP routes reach that
 * engine, so route handlers stay proxy-thin and every test can swap in a
 * fake without a real `admin-api` running (see `test/support/fake-admin-api-client.ts`).
 *
 * IMPORTANT — contract status: `admin-api`'s partner routes are being built
 * in parallel, on a different branch, and were not visible while writing this
 * client. The method shapes below were written against the route list given
 * for this task:
 *
 *   POST /partner-applications
 *   PATCH /partner-applications/:id/status        (staff-only — not called here)
 *   POST/PATCH /partners/:id/campaigns
 *   POST /campaigns/:id/signup                     (not called here — see below)
 *   POST /campaigns/:id/paid-conversion             (not called here — see below)
 *   GET /partners/:id/funnel
 *   POST /partners/:id/statements
 *   GET /partners/:id/statements
 *   PATCH /payouts/:id/status                      (staff-only — not called here)
 *   POST/DELETE /partners/:id/institutions          (admin-assignment — not called here)
 *   GET /exports/{attribution|statements|payouts}   (admin/finance-only — not called here)
 *
 * Routes intentionally NOT proxied by this BFF (see `adapters/out/http/admin-api.client.ts`
 * docblock for the full rationale):
 *  - `PATCH /partner-applications/:id/status` and `PATCH /payouts/:id/status` are
 *    staff/finance decisions made in bio-admin's own admin-web, never from this
 *    partner-facing portal (PRD-011 explicitly has no review UI here).
 *  - `POST/DELETE /partners/:id/institutions` is the admin-side assignment
 *    workflow (PRD-011 non-goal); partners only ever *read* their assigned
 *    institutions (derived from the funnel read-model below).
 *  - `POST /campaigns/:id/signup` / `.../paid-conversion` are written by other
 *    systems (e.g. the student registration/payment flow) when a referral
 *    code is used — PRD-011 says these "appear in the dashboard" automatically,
 *    i.e. this portal only ever *reads* the resulting funnel counts.
 *  - `GET /exports/*` is an admin/finance bulk-export surface, unscoped to a
 *    single partner — out of scope for partner self-service.
 *
 * Gaps filled by assumption (flag for reconciliation at merge time):
 *  - There is no enumerated "read a partner application/profile" route, but
 *    PRD-011 requires application status to be visible, so one must exist.
 *    This client assumes `GET /partner-applications/:id`.
 *  - `partnerId` (the `:id` segment throughout) is assumed to be the same
 *    value as the authenticated partner's JWT `sub` — i.e. admin-api keys
 *    partner records by platform user id, never a separately-generated id.
 *    `createPartnerApplication` passes `partnerId` explicitly in the POST
 *    body so admin-api can create the record under that id from the start.
 *  - There is no enumerated "list campaigns" or "list institutions" route.
 *    Both are assumed to be derivable from the one funnel read-model
 *    (`GET /partners/:id/funnel`), which is assumed to return a per-campaign
 *    breakdown (including the campaign's share code/URL) and a per-institution
 *    breakdown together with the totals.
 *  - `PATCH /partners/:id/campaigns` is assumed to address one campaign at
 *    `/partners/:id/campaigns/:campaignId` (the given route list does not
 *    spell out where the campaign id goes for an update).
 *  - Statement objects are assumed to double as payout-ledger entries (each
 *    carrying `payoutStatus` + `financeSignOff` + a downloadable URL), since
 *    no separate "list payouts" read route was enumerated.
 */

export type PartnerApplicationStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

/**
 * Access status of the admin-api `Partner` aggregate. This — not the
 * application status — is the authoritative dashboard gate: staff drive it via
 * admin-api `PATCH /partners/:id/access`, so a REVOKED partner loses access on
 * their very next request even with a still-valid token.
 */
export type PartnerAccessStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";

export interface Partner {
	readonly id: string;
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
	readonly status: PartnerAccessStatus;
	readonly commissionRatePct: number;
	readonly createdAt: string;
}

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

export interface InstitutionPerformance {
	readonly institutionId: string;
	readonly institutionName: string;
	readonly leads: number;
	readonly signups: number;
	readonly paidConversions: number;
}

export interface CampaignFunnelBreakdown {
	readonly campaignId: string;
	readonly name: string;
	readonly code: string;
	readonly shareUrl: string;
	readonly status: CampaignStatus;
	readonly leads: number;
	readonly signups: number;
	readonly paidConversions: number;
}

export interface PartnerFunnelTotals {
	readonly leads: number;
	readonly signups: number;
	readonly paidConversions: number;
}

export interface PartnerFunnel {
	readonly partnerId: string;
	readonly totals: PartnerFunnelTotals;
	readonly campaigns: readonly CampaignFunnelBreakdown[];
	readonly institutions: readonly InstitutionPerformance[];
	readonly generatedAt: string;
}

export type CampaignStatus = "ACTIVE" | "PAUSED";

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

/**
 * Every method takes the partner's raw bearer token and forwards it to
 * `admin-api` (Authorization pass-through) so admin-api independently
 * verifies identity rather than trusting a bare service-to-service call —
 * defense in depth for the "no cross-partner leakage" requirement.
 */
export interface AdminApiClient {
	createPartnerApplication(
		partnerId: string,
		input: PartnerApplicationInput,
		token: string,
	): Promise<PartnerApplication>;

	getPartnerApplication(partnerId: string, token: string): Promise<PartnerApplication | null>;

	/** The Partner aggregate — its `status` is the dashboard access gate. */
	getPartner(partnerId: string, token: string): Promise<Partner | null>;

	getFunnel(partnerId: string, token: string): Promise<PartnerFunnel>;

	createCampaign(partnerId: string, input: CampaignInput, token: string): Promise<Campaign>;

	updateCampaign(
		partnerId: string,
		campaignId: string,
		input: CampaignUpdateInput,
		token: string,
	): Promise<Campaign>;

	requestStatement(
		partnerId: string,
		input: StatementRequestInput,
		token: string,
	): Promise<Statement>;

	listStatements(partnerId: string, token: string): Promise<Statement[]>;
}
