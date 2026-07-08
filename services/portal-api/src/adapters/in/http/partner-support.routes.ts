import { Elysia, t } from "elysia";
import type { AdminApiClient, SupportRequestRepository } from "../../../core/ports/out/index.ts";
import { createAuthPlugin } from "./auth.plugin";
import { requireApprovedPartner } from "./require-approved-partner";

/**
 * Campaign/pricing support-request routes (PRD-011).
 *
 * "Submission + status only — no ticket system, no admin reply thread in
 * this app": this route file intentionally has no reply/thread/comment
 * endpoints, only create + list-mine. The dispute-contact requirement
 * ("plain link, e.g. mailto:, not an in-portal ticket system") needs no
 * route at all — it is rendered directly by `apps/partner-portal-web` as a
 * static `mailto:` link.
 */
export function partnerSupportRoutes(
	supportRequestRepository: SupportRequestRepository,
	adminApiClient: AdminApiClient,
	jwtSecret: string,
) {
	return new Elysia({ name: "partner-support-routes", prefix: "/partner" })
		.use(createAuthPlugin(jwtSecret))
		.post(
			"/support-requests",
			async ({ auth, token, body }) => {
				const application = await requireApprovedPartner(auth, adminApiClient, token);
				const data = await supportRequestRepository.create(application.partnerId, body);
				return { success: true, data };
			},
			{
				body: t.Object(
					{
						category: t.UnionEnum(["CAMPAIGN", "PRICING", "OTHER"]),
						subject: t.String({ minLength: 1, maxLength: 200 }),
						message: t.String({ minLength: 1, maxLength: 4000 }),
					},
					{ additionalProperties: false },
				),
			},
		)
		.get("/support-requests", async ({ auth, token }) => {
			const application = await requireApprovedPartner(auth, adminApiClient, token);
			const data = await supportRequestRepository.listByPartner(application.partnerId);
			return { success: true, data };
		});
}
