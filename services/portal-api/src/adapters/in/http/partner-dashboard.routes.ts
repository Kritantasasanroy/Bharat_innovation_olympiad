import { Elysia, t } from "elysia";
import { NotFoundError } from "../../../core/errors";
import type { AdminApiClient } from "../../../core/ports/out/index.ts";
import { createAuthPlugin } from "./auth.plugin";
import { requireApprovedPartner } from "./require-approved-partner";

/**
 * Approved-partner dashboard routes (PRD-011): assigned institutions,
 * conversion funnel, referral campaign/link management, and the commission
 * statement / payout ledger view.
 *
 * Every handler here calls {@link requireApprovedPartner} first — a partner
 * whose application is missing, SUBMITTED, or REJECTED gets a 403 before any
 * `admin-api` call is made — and every downstream `admin-api` call is scoped
 * to `application.partnerId` (derived from the token's `sub`), never a
 * client-supplied id. No route in this file accepts a partner id from the
 * URL, query, or body.
 */
export function partnerDashboardRoutes(adminApiClient: AdminApiClient, jwtSecret: string) {
	return new Elysia({ name: "partner-dashboard-routes", prefix: "/partner" })
		.use(createAuthPlugin(jwtSecret))
		.get("/institutions", async ({ auth, token }) => {
			const application = await requireApprovedPartner(auth, adminApiClient, token);
			const funnel = await adminApiClient.getFunnel(application.partnerId, token ?? "");
			return { success: true, data: { institutions: funnel.institutions } };
		})
		.get("/institutions/:institutionId", async ({ auth, token, params }) => {
			const application = await requireApprovedPartner(auth, adminApiClient, token);
			const funnel = await adminApiClient.getFunnel(application.partnerId, token ?? "");
			const institution = funnel.institutions.find(
				(candidate) => candidate.institutionId === params.institutionId,
			);
			if (!institution) {
				throw new NotFoundError("Institution", params.institutionId);
			}
			return { success: true, data: institution };
		})
		.get("/funnel", async ({ auth, token }) => {
			const application = await requireApprovedPartner(auth, adminApiClient, token);
			const data = await adminApiClient.getFunnel(application.partnerId, token ?? "");
			return { success: true, data };
		})
		.post(
			"/campaigns",
			async ({ auth, token, body }) => {
				const application = await requireApprovedPartner(auth, adminApiClient, token);
				const data = await adminApiClient.createCampaign(application.partnerId, body, token ?? "");
				return { success: true, data };
			},
			{
				body: t.Object(
					{
						name: t.String({ minLength: 1, maxLength: 200 }),
						institutionId: t.Optional(t.String()),
					},
					{ additionalProperties: false },
				),
			},
		)
		.patch(
			"/campaigns/:campaignId",
			async ({ auth, token, params, body }) => {
				const application = await requireApprovedPartner(auth, adminApiClient, token);
				const data = await adminApiClient.updateCampaign(
					application.partnerId,
					params.campaignId,
					body,
					token ?? "",
				);
				return { success: true, data };
			},
			{
				body: t.Object(
					{
						name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
						status: t.Optional(t.UnionEnum(["ACTIVE", "PAUSED"])),
					},
					{ additionalProperties: false },
				),
			},
		)
		.post(
			"/statements",
			async ({ auth, token, body }) => {
				const application = await requireApprovedPartner(auth, adminApiClient, token);
				const data = await adminApiClient.requestStatement(
					application.partnerId,
					body,
					token ?? "",
				);
				return { success: true, data };
			},
			{
				body: t.Object(
					{ periodStart: t.String(), periodEnd: t.String() },
					{ additionalProperties: false },
				),
			},
		)
		.get("/statements", async ({ auth, token }) => {
			const application = await requireApprovedPartner(auth, adminApiClient, token);
			const data = await adminApiClient.listStatements(application.partnerId, token ?? "");
			return { success: true, data };
		});
}
