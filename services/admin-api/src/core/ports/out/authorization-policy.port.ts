/**
 * Authorization policy output port.
 *
 * Defines the deny-by-default admin capability model that sits over the
 * verified claims produced by `@bio/auth-kit`. The concrete `@bio/auth-kit`
 * package owns token issuance/verification and the canonical claim shape; this
 * port describes only what `bio-admin` consumes from it, so the package can be
 * swapped without touching core logic.
 *
 * Deny-by-default is the governing rule everywhere in this file:
 *  - a role that is not present in {@link ADMIN_CAPABILITY_MAP} grants nothing;
 *  - a capability that a role's grant list does not name is denied;
 *  - absence of claims (no/!invalid token) grants nothing.
 */

/**
 * Admin role catalog (PRD-AUTH-04 FR-5).
 *
 * Roles map to explicit capabilities via {@link ADMIN_CAPABILITY_MAP}; the role
 * name itself is never the authorization decision (the backend checks a
 * capability, not a role name).
 */
export const ADMIN_ROLES = [
	"SUPER_ADMIN",
	"CONTENT_ADMIN",
	"CONTENT_CURATOR",
	"REVIEWER",
	"SCHEDULER",
	"RESULT_MANAGER",
	"PROCTOR_REVIEWER",
	"SUPPORT",
	"FINANCE",
	"ANALYST",
] as const;

/** A known admin role. */
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Capability keys checked before a guarded operation.
 *
 * Each maps to a PRD policy decision (PRD-AUTH-04 FR-8 / PRD-PLAT-05 FR-1).
 * Extend by adding a key here and granting it to the appropriate roles in
 * {@link ADMIN_CAPABILITY_MAP}; an unlisted capability is denied to everyone.
 */
export const ADMIN_CAPABILITIES = [
	"question:edit",
	"answer-key:view",
	"answer-key:edit",
	"exam:publish",
	"slot:schedule",
	"result:release",
	"proctor-report:view",
	"admin-user:manage",
	"audit-log:view",
] as const;

/** A known admin capability. */
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

/**
 * Verified admin claims as consumed from `@bio/auth-kit`.
 *
 * This is the contract surface `bio-admin` depends on, not the full auth-kit
 * token. `roles` is intentionally `readonly string[]` (not `AdminRole[]`)
 * because the token is an untrusted external input: unknown role strings are
 * filtered out when resolving capabilities (deny-by-default).
 */
export interface AuthKitClaims {
	/** Subject — the admin user id. */
	readonly sub: string;
	/** Roles asserted by the token (validated against {@link ADMIN_ROLES}). */
	readonly roles: readonly string[];
	/** Session id, when the token carries one. */
	readonly sessionId?: string | undefined;
	/** Whether MFA was satisfied for this session. */
	readonly mfa?: boolean | undefined;
	/** Token expiry as a Unix epoch (seconds), when present. */
	readonly expiresAt?: number | undefined;
}

/** Outcome of an authorization check: allow/deny plus a human-readable reason. */
export interface AuthorizationDecision {
	readonly allowed: boolean;
	readonly reason: string;
}

/**
 * Deny-by-default mapping of role to granted capabilities.
 *
 * Guardrails from PRD-AUTH-04 FR-5 are encoded here: a curator cannot publish,
 * a scheduler cannot edit answer keys, support cannot view answer keys. Any
 * role/capability pair not listed below is denied.
 */
export const ADMIN_CAPABILITY_MAP: Readonly<Record<AdminRole, readonly AdminCapability[]>> = {
	SUPER_ADMIN: [...ADMIN_CAPABILITIES],
	CONTENT_ADMIN: ["question:edit", "answer-key:view", "answer-key:edit"],
	CONTENT_CURATOR: ["question:edit"],
	REVIEWER: ["question:edit", "answer-key:view"],
	SCHEDULER: ["slot:schedule", "exam:publish"],
	RESULT_MANAGER: ["result:release"],
	PROCTOR_REVIEWER: ["proctor-report:view"],
	SUPPORT: ["audit-log:view"],
	FINANCE: ["audit-log:view"],
	ANALYST: ["audit-log:view"],
} as const;

/**
 * Output port: resolves and evaluates admin capabilities from auth-kit claims.
 *
 * Implementations must be pure and deny-by-default. They translate verified
 * claims into a capability set and answer capability checks; they never perform
 * token verification (that is the inbound adapter's job over `@bio/auth-kit`).
 */
export interface AuthorizationPolicyPort {
	/**
	 * Resolve the capability set granted by the given claims. Unknown roles
	 * contribute nothing; the result is empty when no role grants anything.
	 */
	resolveCapabilities(claims: AuthKitClaims): ReadonlySet<AdminCapability>;

	/**
	 * Decide whether the claims grant a capability. Returns `allowed: false`
	 * with a reason whenever the capability is not explicitly granted.
	 */
	authorize(claims: AuthKitClaims, capability: AdminCapability): AuthorizationDecision;
}
