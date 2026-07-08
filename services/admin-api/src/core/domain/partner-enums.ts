/**
 * Domain enums for the Partner Attribution, Commission & Payout Engine
 * (PRD-046).
 */

/** Status of a `Partner` aggregate. A partner is created (PENDING) alongside
 * its onboarding application, and flips to APPROVED/REJECTED when staff decide. */
export const PartnerStatus = {
	PENDING: "PENDING",
	APPROVED: "APPROVED",
	REJECTED: "REJECTED",
} as const;
export type PartnerStatus = (typeof PartnerStatus)[keyof typeof PartnerStatus];

/** Status of a `PartnerApplication` (the manual-decision hook record). */
export const ApplicationStatus = {
	SUBMITTED: "SUBMITTED",
	APPROVED: "APPROVED",
	REJECTED: "REJECTED",
} as const;
export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

/** Status of a `Campaign` (referral link + coupon pair). */
export const CampaignStatus = {
	ACTIVE: "ACTIVE",
	DEACTIVATED: "DEACTIVATED",
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

/** Lifecycle status of a single `AttributionRecord`. */
export const AttributionStatus = {
	/** Signup touch captured; no paid conversion yet. */
	OPEN: "OPEN",
	/** Paid conversion credited to a partner+campaign. */
	CREDITED: "CREDITED",
} as const;
export type AttributionStatus = (typeof AttributionStatus)[keyof typeof AttributionStatus];

/**
 * Which rule resolved an attribution when both a first-touch referral link
 * and a later checkout coupon are present (decision: first-touch wins).
 */
export const AttributionRule = {
	/** An earlier signup-time link touch existed and took precedence. */
	LINK_FIRST_TOUCH: "LINK_FIRST_TOUCH",
	/** No prior link touch; the checkout-time coupon governed the credit. */
	COUPON_ONLY: "COUPON_ONLY",
	/** Credited directly off the campaign the signup link touch was for. */
	LINK_ONLY: "LINK_ONLY",
} as const;
export type AttributionRule = (typeof AttributionRule)[keyof typeof AttributionRule];

/** Status of a `CommissionStatement` version. Every issued version is immutable. */
export const StatementStatus = {
	ISSUED: "ISSUED",
} as const;
export type StatementStatus = (typeof StatementStatus)[keyof typeof StatementStatus];

/** Status of a `PayoutLedgerEntry`. Transitions are strictly sequential. */
export const PayoutStatus = {
	PENDING: "PENDING",
	SIGNED_OFF: "SIGNED_OFF",
	RELEASED: "RELEASED",
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];
