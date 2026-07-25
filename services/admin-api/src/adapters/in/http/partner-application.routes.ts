import { Elysia, t } from "elysia";
import type { PartnerContainer } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";
import { assertStaffRole } from "./partner-auth.helpers";

/**
 * Partner onboarding application routes (PRD-046).
 *
 * `POST /partner-applications` and `GET /partner-applications/:id` are
 * intentionally PUBLIC (no auth): this is an external-facing intake form —
 * the applicant has no platform account yet, so there is nothing to
 * authenticate against. `PATCH .../status` is the staff-only manual-decision
 * hook: there is NO review UI, queue, or assignment machinery — just this one
 * minimal, audited endpoint (mandatory reason, actor recorded).
 */
export const partnerApplicationRoutes = (container: PartnerContainer) =>
	new Elysia({ name: "partner-application-routes" })
		.use(authPlugin)
		.post(
			"/partner-applications",
			async ({ body }) => {
				const data = await container.partnerApplicationService.submit(body);
				return { success: true, data };
			},
			{
				body: t.Object({
					orgName: t.String(),
					contactPerson: t.String(),
					email: t.String(),
					phone: t.String(),
				}),
			},
		)
		.get("/partner-applications/:id", async ({ params }) => {
			const data = await container.partnerApplicationService.get(params.id);
			return { success: true, data };
		})
		.patch(
			"/partner-applications/:id/status",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertStaffRole(user);

				const data = await container.partnerApplicationService.decide({
					applicationId: params.id,
					status: body.status,
					reason: body.reason,
					decidedBy: user.userId,
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					status: t.Union([t.Literal("APPROVED"), t.Literal("REJECTED")]),
					reason: t.String(),
				}),
			},
		);
