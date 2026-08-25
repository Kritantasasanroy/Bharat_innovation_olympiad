import type { ApplicationStatus } from "../../domain/partner-enums";
import type {
	AttributionRecord,
	BankDetails,
	Campaign,
	CampaignCaps,
	Partner,
	PartnerApplication,
	PartnerFunnel,
	PartnerInstitutionAssignment,
	Payout,
} from "../../domain/partner-models";

// ── Partner applications (PRD-046: no review UI/queue — a minimal audited hook) ──

export interface SubmitPartnerApplicationInput {
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
}

export interface SubmitPartnerApplicationUseCase {
	execute(input: SubmitPartnerApplicationInput): Promise<PartnerApplication>;
}

export interface GetPartnerApplicationUseCase {
	execute(applicationId: string): Promise<PartnerApplication>;
}

export interface DecidePartnerApplicationInput {
	readonly applicationId: string;
	readonly status: Extract<ApplicationStatus, "APPROVED" | "REJECTED">;
	readonly reason: string;
	readonly decidedBy: string;
}

export interface DecidePartnerApplicationUseCase {
	execute(input: DecidePartnerApplicationInput): Promise<PartnerApplication>;
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export interface CreateCampaignInput {
	readonly partnerId: string;
	readonly name: string;
	readonly caps?: CampaignCaps | null;
}

export interface UpdateCampaignInput {
	readonly partnerId: string;
	readonly campaignId: string;
	readonly name?: string;
	readonly caps?: CampaignCaps | null;
	readonly deactivate?: boolean;
}

export interface CampaignUseCase {
	create(input: CreateCampaignInput): Promise<Campaign>;
	update(input: UpdateCampaignInput): Promise<Campaign>;
}

// ── Attribution capture (self-contained simulation of PRD-020/010/023) ───────

export interface CaptureSignupInput {
	readonly campaignId: string;
	readonly studentId: string;
}

export interface CapturePaidConversionInput {
	readonly campaignId: string;
	readonly studentId: string;
	readonly registrationId: string;
	readonly amountPaise: number;
}

export interface AttributionUseCase {
	captureSignup(input: CaptureSignupInput): Promise<AttributionRecord>;
	capturePaidConversion(input: CapturePaidConversionInput): Promise<AttributionRecord>;
	getFunnel(partnerId: string): Promise<PartnerFunnel>;
}

// ── Payouts ──────────────────────────────────────────────────────────────────

export interface TriggerPayoutInput {
	readonly partnerId: string;
	readonly amountPaise: number;
	readonly note?: string;
	readonly triggeredBy: string;
}

export interface MarkPayoutPaidInput {
	readonly payoutId: string;
	readonly paidBy: string;
}

export interface PayoutUseCase {
	trigger(input: TriggerPayoutInput): Promise<Payout>;
	markPaid(input: MarkPayoutPaidInput): Promise<Payout>;
	listForPartner(partnerId: string): Promise<readonly Payout[]>;
}

// ── Bank details ─────────────────────────────────────────────────────────────

export interface SubmitBankDetailsInput {
	readonly partnerId: string;
	readonly accountHolderName: string;
	readonly bankName: string;
	readonly ifscCode: string;
	readonly accountNumber: string;
	readonly pan: string;
}

export interface BankDetailsUseCase {
	submit(input: SubmitBankDetailsInput): Promise<BankDetails>;
	/** Masked view — safe for any caller who already owns or may see this partner. */
	get(partnerId: string): Promise<BankDetails | null>;
	/** Decrypts the account number + PAN. Callers are responsible for audit-logging who/why. */
	reveal(
		partnerId: string,
	): Promise<{ readonly accountNumber: string; readonly pan: string } | null>;
}

// ── Institution assignment ──────────────────────────────────────────────────

export interface AssignInstitutionInput {
	readonly partnerId: string;
	readonly institutionId: string;
	readonly assignedBy: string;
}

export interface UnassignInstitutionInput {
	readonly partnerId: string;
	readonly institutionId: string;
	readonly assignedBy: string;
}

export interface InstitutionAssignmentUseCase {
	assign(input: AssignInstitutionInput): Promise<PartnerInstitutionAssignment>;
	unassign(input: UnassignInstitutionInput): Promise<PartnerInstitutionAssignment>;
	list(partnerId: string): Promise<readonly PartnerInstitutionAssignment[]>;
}

// ── Partner read + exports ───────────────────────────────────────────────────

export interface GetPartnerUseCase {
	execute(partnerId: string): Promise<Partner>;
}

export type ExportKind = "attribution" | "payouts";

export interface ExportUseCase {
	execute(kind: ExportKind): Promise<string>;
}
