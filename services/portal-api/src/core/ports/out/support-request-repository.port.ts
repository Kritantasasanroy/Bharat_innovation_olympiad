/**
 * Outbound port for the campaign/pricing support-request form (PRD-011).
 *
 * Unlike the other partner-facing features, support requests are not part of
 * the admin-api attribution/commission/payout engine (PRD-046) — the given
 * admin-api route list has nothing resembling a support-request resource, and
 * PRD-011 is explicit that this is "submission + status only — no ticket
 * system, no admin reply thread". Rather than invent an admin-api endpoint
 * the other workstream never asked for, portal-api owns this small resource
 * itself, behind this port, the same way `admin-api`'s own
 * `NoopAuditSink` (`services/admin-api/src/adapters/out/audit/noop-audit-sink.ts`)
 * is an in-process placeholder for a durable store that can land later
 * without changing the port.
 */

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

export interface SupportRequestRepository {
	create(partnerId: string, input: SupportRequestInput): Promise<SupportRequest>;
	listByPartner(partnerId: string): Promise<SupportRequest[]>;
}
