import type { ApplicationStatus } from "../../domain/partner-enums";
import type {
	AttributionRecord,
	Campaign,
	CampaignCaps,
	CommissionStatement,
	Partner,
	PartnerApplication,
	PartnerFunnel,
	PartnerInstitutionAssignment,
	PayoutLedgerEntry,
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

// ── Commission statements ───────────────────────────────────────────────────

export interface GenerateStatementInput {
	readonly partnerId: string;
	readonly period: string;
}

export interface CommissionUseCase {
	generate(input: GenerateStatementInput): Promise<CommissionStatement>;
	list(partnerId: string): Promise<readonly CommissionStatement[]>;
}

// ── Payouts ──────────────────────────────────────────────────────────────────

export interface UpdatePayoutStatusInput {
	readonly payoutId: string;
	readonly status: "SIGNED_OFF" | "RELEASED";
	readonly actor: string;
	readonly approver?: string;
	readonly reason?: string;
}

export interface PayoutUseCase {
	updateStatus(input: UpdatePayoutStatusInput): Promise<PayoutLedgerEntry>;
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

export type ExportKind = "attribution" | "statements" | "payouts";

export interface ExportUseCase {
	execute(kind: ExportKind): Promise<string>;
}
