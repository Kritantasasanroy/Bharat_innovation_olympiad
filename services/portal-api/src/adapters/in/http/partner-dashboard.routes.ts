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
	return (
		new Elysia({ name: "partner-dashboard-routes", prefix: "/partner" })
			.use(createAuthPlugin(jwtSecret))
			/**
			 * The approved-partner identity for the dashboard shell. Returns 403 the
			 * moment staff revoke access, which is what the client uses to bounce a
			 * revoked partner out of `/dashboard/*`.
			 */
			.get("/me", async ({ auth, token }) => {
				const partner = await requireApprovedPartner(auth, adminApiClient, token);
				return { success: true, data: partner };
			})
			.get("/institutions", async ({ auth, token }) => {
				const partner = await requireApprovedPartner(auth, adminApiClient, token);
				const institutions = await adminApiClient.getInstitutions(partner.partnerId, token ?? "");
				return { success: true, data: { institutions } };
			})
			.get("/institutions/:institutionId", async ({ auth, token, params }) => {
				const partner = await requireApprovedPartner(auth, adminApiClient, token);
				const institutions = await adminApiClient.getInstitutions(partner.partnerId, token ?? "");
				const institution = institutions.find(
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
					const data = await adminApiClient.createCampaign(
						application.partnerId,
						body,
						token ?? "",
					);
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
					const partner = await requireApprovedPartner(auth, adminApiClient, token);
					const data = await adminApiClient.updateCampaign(
						partner.partnerId,
						params.campaignId,
						{
							...(body.name !== undefined ? { name: body.name } : {}),
							...(body.status !== undefined ? { status: body.status } : {}),
						},
						token ?? "",
					);
					return { success: true, data };
				},
				{
					body: t.Object(
						{
							name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
							// Mirrors admin-api's CampaignStatus (DEACTIVATED, not "PAUSED").
							status: t.Optional(t.UnionEnum(["ACTIVE", "DEACTIVATED"])),
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
			})
	);
}
