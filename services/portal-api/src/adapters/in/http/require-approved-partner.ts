import { PartnerNotApprovedError } from "../../../core/errors";
import type { AdminApiClient, PartnerApplication } from "../../../core/ports/out/index.ts";
import type { AuthContext } from "./auth.plugin";
import { requirePartnerAuth } from "./auth.plugin";

/**
 * Gate for every "dashboard" route (PRD-011 acceptance criterion: "Routes
 * must be gated on approved status; a partner with a SUBMITTED or REJECTED
 * application should not reach the dashboard").
 *
 * Resolves the caller's own partner-application record (by the token's
 * `sub` — never a client-supplied id) and throws {@link PartnerNotApprovedError}
 * (403) unless its status is `APPROVED`. Returns the application so route
 * handlers can read `partnerId` off it without re-deriving anything.
 */
export async function requireApprovedPartner(
	auth: AuthContext | null,
	adminApiClient: AdminApiClient,
	token: string | null,
): Promise<PartnerApplication> {
	const user = requirePartnerAuth(auth);
	const application = await adminApiClient.getPartnerApplication(user.userId, token ?? "");
	if (!application) {
		throw new PartnerNotApprovedError("NOT_SUBMITTED");
	}
	if (application.status !== "APPROVED") {
		throw new PartnerNotApprovedError(application.status);
	}
	return application;
}
