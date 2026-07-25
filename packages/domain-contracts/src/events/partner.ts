/**
 * Partner event family (PRD-046: Partner Attribution, Commission & Payout Engine).
 *
 * Producer surface: `bio-admin`. Covers the partner onboarding-application
 * lifecycle, attribution crediting, commission-statement issuance, and payout
 * status transitions. Everything here is admin/finance-internal — partner and
 * payout data never reaches a student-facing contract (FR-5).
 */
import { z } from "zod";
import {
	count,
	defineCatalog,
	FieldClassification as FC,
	field,
	id,
	text,
	timestamp,
} from "./_shared.ts";

/** Lifecycle status of a `Partner` aggregate. */
const PartnerStatus = z.enum(["PENDING", "APPROVED", "REJECTED"]);

/** Which rule resolved an attribution conflict (first-touch link vs. checkout coupon). */
const AttributionRule = z.enum(["LINK_FIRST_TOUCH", "COUPON_ONLY", "LINK_ONLY"]);

/** Payout ledger entry status. */
const PayoutStatus = z.enum(["PENDING", "SIGNED_OFF", "RELEASED"]);

/** `PartnerApplicationSubmitted` — a new partner onboarding application lands (SUBMITTED). */
export const PartnerApplicationSubmittedPayload = z.object({
	applicationId: id("Submitted application id.", FC.AdminOnly),
	partnerId: id("Provisional partner record created alongside the application.", FC.AdminOnly),
	orgName: text("Applicant organisation name.", FC.AdminOnly),
	contactPerson: text("Applicant contact person.", FC.AdminOnly),
	email: text("Applicant contact email.", FC.AdminOnly),
	submittedAt: timestamp("When the application was submitted."),
});
export type PartnerApplicationSubmitted = z.infer<typeof PartnerApplicationSubmittedPayload>;

/** `PartnerStatusChanged` — staff decided (or otherwise changed) a partner's status. */
export const PartnerStatusChangedPayload = z.object({
	partnerId: id("Affected partner id.", FC.AdminOnly),
	applicationId: field(
		z.string().min(1).optional(),
		FC.AdminOnly,
		"Application whose decision drove this change, when applicable.",
	),
	previousStatus: field(PartnerStatus, FC.AdminOnly, "Status before the change."),
	newStatus: field(PartnerStatus, FC.AdminOnly, "Status after the change."),
	reason: text("Mandatory reason recorded for the decision.", FC.AdminOnly),
	decidedBy: id("Staff actor who made the decision.", FC.AdminOnly),
	decidedAt: timestamp("When the decision was recorded."),
});
export type PartnerStatusChanged = z.infer<typeof PartnerStatusChangedPayload>;

/** `AttributionCredited` — a paid conversion was credited to a partner's campaign. */
export const AttributionCreditedPayload = z.object({
	attributionId: id("Credited attribution record id.", FC.AdminOnly),
	partnerId: id("Partner credited for the conversion.", FC.AdminOnly),
	campaignId: id("Campaign the conversion is attributed to.", FC.AdminOnly),
	studentId: id("Student whose paid conversion was attributed.", FC.AdminOnly),
	registrationId: id("Paid registration the credit is for.", FC.AdminOnly),
	ruleApplied: field(AttributionRule, FC.AdminOnly, "Which tie-break rule resolved the credit."),
	amountPaise: count("Paid-conversion amount, in paise.", FC.AdminOnly),
	convertedAt: timestamp("When the conversion was credited."),
});
export type AttributionCredited = z.infer<typeof AttributionCreditedPayload>;

/** `CommissionStatementIssued` — a new (immutable) commission statement version was issued. */
export const CommissionStatementIssuedPayload = z.object({
	statementId: id("Issued statement id.", FC.AdminOnly),
	partnerId: id("Partner the statement is for.", FC.AdminOnly),
	period: text("Billing period the statement covers (e.g. 2026-06).", FC.AdminOnly),
	version: count("Monotonic version for this partner+period.", FC.AdminOnly),
	totalPaise: count("Total commission amount, in paise.", FC.AdminOnly),
	issuedAt: timestamp("When this version was issued."),
});
export type CommissionStatementIssued = z.infer<typeof CommissionStatementIssuedPayload>;

/** `PayoutStatusChanged` — a payout ledger entry transitioned status. */
export const PayoutStatusChangedPayload = z.object({
	payoutId: id("Affected payout ledger entry id.", FC.AdminOnly),
	partnerId: id("Partner the payout belongs to.", FC.AdminOnly),
	statementId: id("Commission statement the payout was created from.", FC.AdminOnly),
	previousStatus: field(PayoutStatus, FC.AdminOnly, "Status before the transition."),
	newStatus: field(PayoutStatus, FC.AdminOnly, "Status after the transition."),
	changedBy: id("Staff actor who made the transition.", FC.AdminOnly),
	changedAt: timestamp("When the transition was recorded."),
});
export type PayoutStatusChanged = z.infer<typeof PayoutStatusChangedPayload>;

/** Partner-family payload catalog, keyed by canonical `eventType`. */
export const PARTNER_EVENT_PAYLOADS = defineCatalog({
	PartnerApplicationSubmitted: PartnerApplicationSubmittedPayload,
	PartnerStatusChanged: PartnerStatusChangedPayload,
	AttributionCredited: AttributionCreditedPayload,
	CommissionStatementIssued: CommissionStatementIssuedPayload,
	PayoutStatusChanged: PayoutStatusChangedPayload,
});

/** Partner-family event-type names. */
export const PARTNER_EVENT_TYPES = Object.keys(
	PARTNER_EVENT_PAYLOADS,
) as (keyof typeof PARTNER_EVENT_PAYLOADS)[];
