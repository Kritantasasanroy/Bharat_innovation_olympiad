import { PartnerNotApprovedError } from "../../../core/errors";
import type { AdminApiClient } from "../../../core/ports/out/index.ts";
import type { AuthContext } from "./auth.plugin";
import { requirePartnerAuth } from "./auth.plugin";

/** The minimal partner identity every dashboard handler needs. */
export interface ApprovedPartner {
	readonly partnerId: string;
	readonly orgName: string;
	readonly email: string;
}

/**
 * Gate for every "dashboard" route (PRD-011 acceptance criterion: "Routes
 * must be gated on approved status; a partner with a SUBMITTED or REJECTED
 * application should not reach the dashboard").
 *
 * Resolves the caller's own **Partner aggregate** (by the token's `sub` — never
 * a client-supplied id) and throws {@link PartnerNotApprovedError} (403) unless
 * its status is `APPROVED`.
 *
 * This deliberately gates on `Partner.status`, not the onboarding application's
 * status. Staff drive `Partner.status` through admin-api
 * `PATCH /partners/:id/access` (APPROVED | REJECTED | REVOKED), and because this
 * guard runs on *every* dashboard request, a **revoke removes access
 * immediately** — even while the partner still holds a valid 24h token. It also
 * removes the old bug where the partner's `sub` was passed to
 * `GET /partner-applications/:id`, which expects an *application* id.
 */
export async function requireApprovedPartner(
	auth: AuthContext | null,
	adminApiClient: AdminApiClient,
	token: string | null,
): Promise<ApprovedPartner> {
	const user = requirePartnerAuth(auth);
	const partner = await adminApiClient.getPartner(user.userId, token ?? "");
	if (!partner) {
		throw new PartnerNotApprovedError("NOT_SUBMITTED");
	}
	if (partner.status !== "APPROVED") {
		throw new PartnerNotApprovedError(partner.status);
	}
	return { partnerId: partner.id, orgName: partner.orgName, email: partner.email };
}
