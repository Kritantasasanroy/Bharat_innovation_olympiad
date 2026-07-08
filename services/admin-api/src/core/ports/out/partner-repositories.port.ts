import type {
	ApplicationStatus,
	AttributionRule,
	CampaignStatus,
	PartnerStatus,
	PayoutStatus,
} from "../../domain/partner-enums";
import type {
	AttributionRecord,
	Campaign,
	CampaignCaps,
	CommissionLineItem,
	CommissionStatement,
	Partner,
	PartnerApplication,
	PartnerInstitutionAssignment,
	PayoutLedgerEntry,
} from "../../domain/partner-models";

// ── Partner + application ───────────────────────────────────────────────────

export interface NewPartnerApplication {
	readonly applicationId: string;
	readonly partnerId: string;
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
	readonly createdAt: Date;
}

/** Outbound port: Partner aggregate persistence. */
export interface PartnerRepository {
	findById(id: string): Promise<Partner | null>;
	/** Create the provisional Partner row alongside a submitted application (status PENDING). */
	create(input: {
		readonly id: string;
		readonly orgName: string;
		readonly contactPerson: string;
		readonly email: string;
		readonly phone: string;
		readonly commissionRatePct: number;
		readonly createdAt: Date;
	}): Promise<Partner>;
	/** Update status (APPROVED/REJECTED). Returns the updated row, or null if not found. */
	updateStatus(id: string, status: PartnerStatus): Promise<Partner | null>;
}

/** Outbound port: PartnerApplication persistence (the manual-decision hook record). */
export interface PartnerApplicationRepository {
	findById(id: string): Promise<PartnerApplication | null>;
	/** Persist a submitted application (and its linked provisional partner id). */
	create(input: NewPartnerApplication): Promise<PartnerApplication>;
	/** Record the staff decision (audited: mandatory reason + actor). */
	decide(
		id: string,
		status: Extract<ApplicationStatus, "APPROVED" | "REJECTED">,
		reason: string,
		decidedBy: string,
		decidedAt: Date,
	): Promise<PartnerApplication | null>;
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export interface NewCampaign {
	readonly id: string;
	readonly partnerId: string;
	readonly name: string;
	readonly linkToken: string;
	readonly referralCode: string;
	readonly caps: CampaignCaps | null;
	readonly createdAt: Date;
}

/** Outbound port: Campaign (referral link + coupon) persistence. */
export interface CampaignRepository {
	findById(id: string): Promise<Campaign | null>;
	findByPartnerId(partnerId: string): Promise<readonly Campaign[]>;
	/** True when neither `linkToken` nor `referralCode` is already in use by any campaign. */
	isUnique(linkToken: string, referralCode: string): Promise<boolean>;
	create(input: NewCampaign): Promise<Campaign>;
	update(
		id: string,
		patch: { readonly name?: string; readonly caps?: CampaignCaps | null },
	): Promise<Campaign | null>;
	setStatus(id: string, status: CampaignStatus): Promise<Campaign | null>;
}

// ── Attribution ──────────────────────────────────────────────────────────────

/** Outbound port: attribution capture + crediting persistence. */
export interface AttributionRepository {
	findById(id: string): Promise<AttributionRecord | null>;
	/** The most recent OPEN (not-yet-credited) touch for a student, across any campaign. */
	findOpenByStudent(studentId: string): Promise<AttributionRecord | null>;
	/** A CREDITED record for this exact student+registration, if one already exists (idempotency). */
	findCreditedByStudentAndRegistration(
		studentId: string,
		registrationId: string,
	): Promise<AttributionRecord | null>;
	/** Persist a signup-time touch (OPEN, no registration/amount yet). */
	createOpenTouch(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly campaignId: string;
		readonly studentId: string;
		readonly createdAt: Date;
	}): Promise<AttributionRecord>;
	/**
	 * Credit a paid conversion. Reuses `existingId` (an OPEN touch being closed) when
	 * provided, otherwise inserts a brand-new CREDITED record. Enforces the
	 * one-credit-per-student+registration uniqueness constraint.
	 */
	credit(input: {
		readonly existingId: string | null;
		readonly newId: string;
		readonly partnerId: string;
		readonly campaignId: string;
		readonly studentId: string;
		readonly registrationId: string;
		readonly ruleApplied: AttributionRule;
		readonly amountPaise: number;
		readonly convertedAt: Date;
	}): Promise<AttributionRecord>;
	findCreditedByPartnerId(partnerId: string): Promise<readonly AttributionRecord[]>;
	findAllByPartnerId(partnerId: string): Promise<readonly AttributionRecord[]>;
	findAll(): Promise<readonly AttributionRecord[]>;
}

// ── Commission statements ───────────────────────────────────────────────────

/** Outbound port: immutable, versioned commission statement persistence. */
export interface CommissionStatementRepository {
	findById(id: string): Promise<CommissionStatement | null>;
	/** Highest existing version for this partner+period, or 0 when none exist yet. */
	latestVersion(partnerId: string, period: string): Promise<number>;
	/** Insert a brand-new version. Never mutates a prior version (immutability). */
	create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly period: string;
		readonly version: number;
		readonly lineItems: readonly CommissionLineItem[];
		readonly totalPaise: number;
		readonly issuedAt: Date;
	}): Promise<CommissionStatement>;
	findByPartnerId(partnerId: string): Promise<readonly CommissionStatement[]>;
	findAll(): Promise<readonly CommissionStatement[]>;
}

// ── Payout ledger ────────────────────────────────────────────────────────────

/** Outbound port: payout ledger persistence. */
export interface PayoutLedgerRepository {
	findById(id: string): Promise<PayoutLedgerEntry | null>;
	create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly statementId: string;
		readonly amountPaise: number;
		readonly createdAt: Date;
	}): Promise<PayoutLedgerEntry>;
	update(
		id: string,
		patch: {
			readonly status: PayoutStatus;
			readonly financeSignOffApprover?: string | null;
			readonly financeSignOffAt?: Date | null;
			readonly reason?: string | null;
		},
	): Promise<PayoutLedgerEntry | null>;
	findByPartnerId(partnerId: string): Promise<readonly PayoutLedgerEntry[]>;
	findAll(): Promise<readonly PayoutLedgerEntry[]>;
}

// ── Institution assignment ──────────────────────────────────────────────────

/** Outbound port: partner<->institution self-service assignment persistence. */
export interface PartnerInstitutionAssignmentRepository {
	findActive(
		partnerId: string,
		institutionId: string,
	): Promise<PartnerInstitutionAssignment | null>;
	create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly institutionId: string;
		readonly effectiveFrom: Date;
		readonly assignedBy: string;
	}): Promise<PartnerInstitutionAssignment>;
	/** Soft-unassign: sets `effectiveTo` on the active assignment. */
	deactivate(id: string, effectiveTo: Date): Promise<PartnerInstitutionAssignment | null>;
	findByPartnerId(partnerId: string): Promise<readonly PartnerInstitutionAssignment[]>;
}
