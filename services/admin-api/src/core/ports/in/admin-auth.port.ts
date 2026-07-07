/**
 * Admin authentication / authorization input (driving) port.
 *
 * Inbound adapters (HTTP, future WS) resolve a request into an
 * {@link AdminAuthContext} and enforce {@link RoleRequirement}s through
 * {@link RequireRole}. The enforcement contract is deny-by-default: a missing
 * context or an unmet requirement always denies.
 */

import type {
	AdminCapability,
	AdminRole,
	AuthorizationDecision,
} from "../out/authorization-policy.port.ts";

/**
 * The authenticated admin principal for a single request.
 *
 * Built from verified `@bio/auth-kit` claims after capabilities have been
 * resolved deny-by-default. `roles` contains only roles recognised by the
 * service; unknown role strings from the token are dropped.
 */
export interface AdminAuthContext {
	/** Admin user id (the token subject). */
	readonly adminId: string;
	/** Recognised roles asserted by the token. */
	readonly roles: readonly AdminRole[];
	/** Capabilities granted to this principal (deny-by-default resolved). */
	readonly capabilities: ReadonlySet<AdminCapability>;
	/** Session id, when the token carries one. */
	readonly sessionId: string | undefined;
	/** Whether MFA was satisfied for this session. */
	readonly mfaSatisfied: boolean;
}

/**
 * What an admin must satisfy to access a guarded operation.
 *
 * `capability` is always required. `anyOf`, when present, additionally requires
 * the principal to hold at least one of the named roles (separation-of-duties
 * narrowing on top of the capability check).
 */
export interface RoleRequirement {
	/** The capability that must be granted. */
	readonly capability: AdminCapability;
	/** Optional role allow-list; the principal must hold one of these. */
	readonly anyOf?: readonly AdminRole[] | undefined;
}

/**
 * Driving port: enforce a {@link RoleRequirement} against an auth context.
 *
 * Deny-by-default — a `null` context (unauthenticated / unverified token) or a
 * requirement the context does not satisfy yields `allowed: false`.
 */
export interface RequireRole {
	enforce(context: AdminAuthContext | null, requirement: RoleRequirement): AuthorizationDecision;
}
