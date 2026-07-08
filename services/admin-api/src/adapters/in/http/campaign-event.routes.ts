import { Elysia, t } from "elysia";
import type { PartnerContainer } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";

/**
 * Simulated attribution-capture events (PRD-046).
 *
 * PRD-020 (landing token issuance), PRD-010 (signup persistence) and PRD-023
 * (paid-conversion event) are not built as separate services anywhere in this
 * codebase, so these two endpoints stand in for that chain end to end:
 *
 *  - `POST /campaigns/:id/signup` simulates "a student signs up with referral
 *    code X" (the landing-token/signup persistence PRDs).
 *  - `POST /campaigns/:id/paid-conversion` simulates the PRD-023
 *    paid-conversion event that closes/credits the attribution.
 *
 * These represent calls FROM other systems (the landing page, the payment
 * gateway webhook) rather than the partner acting on their own data, so they
 * are gated on "any valid authenticated caller" rather than partner
 * ownership — there is no partner to "own" a student's own signup/payment
 * action.
 */
export const campaignEventRoutes = (container: PartnerContainer) =>
	new Elysia({ name: "campaign-event-routes" })
		.use(authPlugin)
		.post(
			"/campaigns/:id/signup",
			async ({ params, body, auth }) => {
				requireAuth(auth);
				const data = await container.attributionService.captureSignup({
					campaignId: params.id,
					studentId: body.studentId,
				});
				return { success: true, data };
			},
			{ body: t.Object({ studentId: t.String() }) },
		)
		.post(
			"/campaigns/:id/paid-conversion",
			async ({ params, body, auth }) => {
				requireAuth(auth);
				const data = await container.attributionService.capturePaidConversion({
					campaignId: params.id,
					studentId: body.studentId,
					registrationId: body.registrationId,
					amountPaise: body.amountPaise,
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					studentId: t.String(),
					registrationId: t.String(),
					amountPaise: t.Number(),
				}),
			},
		);
