import { ForbiddenError } from "../../../core/errors";
import { type AdminRole, denyByDefaultPartnerPolicy } from "../../../core/ports/out";
import type { AuthContext } from "./auth.plugin";

/**
 * Assert that `auth` may access resources scoped to `partnerId` — deny by
 * default (see `partner-authorization.port.ts`): staff roles may act on any
 * partner; otherwise the caller's JWT `sub` must equal the partner's own id.
 * Throws {@link ForbiddenError} (mapped to HTTP 403 by the global error
 * handler) when denied.
 */
export function assertOwnsPartner(auth: AuthContext, partnerId: string): void {
	const decision = denyByDefaultPartnerPolicy.authorizePartnerAccess(
		{ subjectId: auth.userId, role: auth.role },
		partnerId,
	);
	if (!decision.allowed) throw new ForbiddenError(decision.reason);
}

/** Assert that `auth` holds one of the given internal staff roles (empty = any recognised staff role). */
export function assertStaffRole(auth: AuthContext, allowedRoles: readonly AdminRole[] = []): void {
	const decision = denyByDefaultPartnerPolicy.authorizeStaffRole(
		{ subjectId: auth.userId, role: auth.role },
		allowedRoles,
	);
	if (!decision.allowed) throw new ForbiddenError(decision.reason);
}
