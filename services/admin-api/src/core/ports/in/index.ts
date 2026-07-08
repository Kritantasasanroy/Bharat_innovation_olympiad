// Input (driving) port interfaces — add your use-case ports here.
export type {
	AdminAuthContext,
	RequireRole,
	RoleRequirement,
} from "./admin-auth.port.ts";
export type {
	AssignInstitutionInput,
	AttributionUseCase,
	CampaignUseCase,
	CapturePaidConversionInput,
	CaptureSignupInput,
	CommissionUseCase,
	CreateCampaignInput,
	DecidePartnerApplicationInput,
	DecidePartnerApplicationUseCase,
	ExportKind,
	ExportUseCase,
	GenerateStatementInput,
	GetPartnerApplicationUseCase,
	GetPartnerUseCase,
	InstitutionAssignmentUseCase,
	PayoutUseCase,
	SubmitPartnerApplicationInput,
	SubmitPartnerApplicationUseCase,
	UnassignInstitutionInput,
	UpdateCampaignInput,
	UpdatePayoutStatusInput,
} from "./partner.port.ts";
