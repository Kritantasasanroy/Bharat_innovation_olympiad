import { Elysia, t } from "elysia";
import { NotFoundError } from "../../../core/errors";
import type { AdminApiClient } from "../../../core/ports/out/index.ts";
import { createAuthPlugin, requirePartnerAuth } from "./auth.plugin";

/**
 * Onboarding application routes (PRD-011 §"Onboarding application").
 *
 * Self-service only: org name, contact person, email, phone — deliberately
 * NO kyc/Aadhaar/document-upload fields. The body schema below is the only
 * shape this route knows how to accept: Elysia parses the body against it
 * and unconditionally strips any property not declared in the schema (e.g.
 * an `aadhaarNumber`) before the handler ever runs, so no such field can
 * reach `adminApiClient.createPartnerApplication` or get stored — see
 * `test/partner-application.routes.test.ts` for the explicit assertion. The
 * approval decision itself (`PATCH /partner-applications/:id/status` on
 * admin-api) is staff-only and made elsewhere — there is no review UI in
 * this app, and this route file never calls that endpoint.
 */
export function partnerApplicationRoutes(adminApiClient: AdminApiClient, jwtSecret: string) {
	return new Elysia({ name: "partner-application-routes", prefix: "/partner" })
		.use(createAuthPlugin(jwtSecret))
		.post(
			"/applications",
			async ({ auth, token, body }) => {
				const user = requirePartnerAuth(auth);
				const data = await adminApiClient.createPartnerApplication(user.userId, body, token ?? "");
				return { success: true, data };
			},
			{
				body: t.Object(
					{
						orgName: t.String({ minLength: 1, maxLength: 200 }),
						contactPerson: t.String({ minLength: 1, maxLength: 200 }),
						email: t.String({ format: "email" }),
						phone: t.String({ minLength: 1, maxLength: 32 }),
					},
					{ additionalProperties: false },
				),
			},
		)
		.get("/applications/me", async ({ auth, token }) => {
			const user = requirePartnerAuth(auth);
			const data = await adminApiClient.getPartnerApplication(user.userId, token ?? "");
			if (!data) {
				throw new NotFoundError("Partner application");
			}
			return { success: true, data };
		});
}
