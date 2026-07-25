/**
 * Partner-realm authorization.
 *
 * Mirrors the SAME deny-by-default pattern as `authorization-policy.port.ts`
 * (which governs internal admin roles), but for the partner realm: a partner
 * only ever sees their own data. A caller is either
 *
 *  - an internal staff/admin principal (any recognised {@link AdminRole}),
 *    who may act on behalf of any partner, or
 *  - a partner principal, whose JWT `sub` IS the partner's own id (there is no
 *    separate partner-user directory in this self-contained slice — see
 *    PRD-046's decision to implement a self-contained attribution path).
 *
 * Anything else — no context, or a subject that is neither staff nor the
 * owning partner — is denied. There is no allow-list of exceptions.
 */

import { ADMIN_ROLES, type AdminRole } from "./authorization-policy.port.ts";

/** Minimal identity extracted from a verified JWT (see `auth.plugin.ts`). */
export interface PartnerAuthContext {
	/** The token subject — a staff admin id, or (for partner callers) the partner's own id. */
	readonly subjectId: string;
	/** Single-role claim carried by the shared JWT (`{ sub, email, role }`). */
	readonly role: string | undefined;
}

/** Outcome of a partner-realm authorization check. */
export interface PartnerAuthorizationDecision {
	readonly allowed: boolean;
	readonly reason: string;
}

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set<string>(ADMIN_ROLES);

/** True when `role` is one of the recognised internal staff/admin roles. */
export function isStaffRole(role: string | undefined): role is AdminRole {
	return role !== undefined && ADMIN_ROLE_SET.has(role);
}

/** Output port: deny-by-default partner-scoped access control. */
export interface PartnerAuthorizationPort {
	/**
	 * Decide whether `context` may access resources scoped to `partnerId`.
	 * Deny-by-default: a `null` context, or a subject that is neither staff
	 * nor the owning partner, is denied.
	 */
	authorizePartnerAccess(
		context: PartnerAuthContext | null,
		partnerId: string,
	): PartnerAuthorizationDecision;
	/** Decide whether `context` holds one of the given internal staff roles. */
	authorizeStaffRole(
		context: PartnerAuthContext | null,
		allowedRoles: readonly AdminRole[],
	): PartnerAuthorizationDecision;
}

/** Deny-by-default {@link PartnerAuthorizationPort} implementation. */
export const denyByDefaultPartnerPolicy: PartnerAuthorizationPort = {
	authorizePartnerAccess(context, partnerId) {
		if (context === null) {
			return { allowed: false, reason: "unauthenticated: no valid token" };
		}
		if (isStaffRole(context.role)) {
			return { allowed: true, reason: `staff override: role ${context.role}` };
		}
		if (context.subjectId === partnerId) {
			return { allowed: true, reason: "owning partner" };
		}
		return { allowed: false, reason: "forbidden: caller does not own this partner" };
	},

	authorizeStaffRole(context, allowedRoles) {
		if (context === null) {
			return { allowed: false, reason: "unauthenticated: no valid token" };
		}
		if (!isStaffRole(context.role)) {
			return { allowed: false, reason: "forbidden: not a recognised staff role" };
		}
		if (allowedRoles.length > 0 && !allowedRoles.includes(context.role)) {
			return {
				allowed: false,
				reason: `forbidden: requires one of roles [${allowedRoles.join(", ")}]`,
			};
		}
		return { allowed: true, reason: `staff role granted: ${context.role}` };
	},
};
