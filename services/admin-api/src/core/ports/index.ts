// Re-export all port interfaces for convenient imports.
export type {
	AdminAuthContext,
	RequireRole,
	RoleRequirement,
} from "./in/index.ts";
export type {
	AdminCapability,
	AdminRole,
	AiProviderPort,
	AiUsage,
	AuditActor,
	AuditActorType,
	AuditEvent,
	AuditOutcome,
	AuditResource,
	AuditSink,
	AuthKitClaims,
	AuthorizationDecision,
	AuthorizationPolicyPort,
	GenerateStructuredOutputParams,
	GenerateStructuredOutputResult,
	GenerateTextParams,
	GenerateTextResult,
} from "./out/index.ts";
export {
	ADMIN_CAPABILITIES,
	ADMIN_CAPABILITY_MAP,
	ADMIN_ROLES,
} from "./out/index.ts";
