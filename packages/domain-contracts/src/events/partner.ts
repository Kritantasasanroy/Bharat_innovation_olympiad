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

/**
 * `PayoutTriggered` — admin decided an amount and triggered a payout for a
 * partner. Not derived from any commission calculation.
 */
export const PayoutTriggeredPayload = z.object({
	payoutId: id("Triggered payout id.", FC.AdminOnly),
	partnerId: id("Partner the payout is for.", FC.AdminOnly),
	amountPaise: count("Amount admin decided to send, in paise.", FC.AdminOnly),
	note: field(z.string().nullable(), FC.AdminOnly, "What this payout covers, freeform."),
	triggeredBy: id("Staff actor who triggered the payout.", FC.AdminOnly),
	triggeredAt: timestamp("When the payout was triggered."),
});
export type PayoutTriggered = z.infer<typeof PayoutTriggeredPayload>;

/** `PayoutPaid` — a triggered payout's money has actually gone out. Terminal. */
export const PayoutPaidPayload = z.object({
	payoutId: id("Affected payout id.", FC.AdminOnly),
	partnerId: id("Partner the payout belongs to.", FC.AdminOnly),
	paidBy: id("Staff actor who marked it paid.", FC.AdminOnly),
	paidAt: timestamp("When it was marked paid."),
});
export type PayoutPaid = z.infer<typeof PayoutPaidPayload>;

/**
 * `BankDetailsSubmitted` — a partner submitted (or resubmitted) where their
 * payouts get sent. Deliberately carries no bank fields at all, sensitive or
 * otherwise — this event exists purely to say "something changed", never to
 * carry the details themselves.
 */
export const BankDetailsSubmittedPayload = z.object({
	partnerId: id("Partner who submitted bank details.", FC.AdminOnly),
	submittedAt: timestamp("When the details were submitted."),
});
export type BankDetailsSubmitted = z.infer<typeof BankDetailsSubmittedPayload>;

/** Partner-family payload catalog, keyed by canonical `eventType`. */
export const PARTNER_EVENT_PAYLOADS = defineCatalog({
	PartnerApplicationSubmitted: PartnerApplicationSubmittedPayload,
	PartnerStatusChanged: PartnerStatusChangedPayload,
	AttributionCredited: AttributionCreditedPayload,
	PayoutTriggered: PayoutTriggeredPayload,
	PayoutPaid: PayoutPaidPayload,
	BankDetailsSubmitted: BankDetailsSubmittedPayload,
});

/** Partner-family event-type names. */
export const PARTNER_EVENT_TYPES = Object.keys(
	PARTNER_EVENT_PAYLOADS,
) as (keyof typeof PARTNER_EVENT_PAYLOADS)[];
