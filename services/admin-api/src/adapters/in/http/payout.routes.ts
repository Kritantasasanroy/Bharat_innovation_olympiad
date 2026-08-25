import { Elysia, t } from "elysia";
import type { PartnerContainer } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";
import { assertStaffRole } from "./partner-auth.helpers";

/**
 * Admin-triggered payouts (no commission rate, no statement): admin decides
 * an amount and triggers it, then marks it paid once the money has actually
 * gone out. Both staff-only, audited — money movement is finance-sensitive.
 */
export const payoutRoutes = (container: PartnerContainer) =>
	new Elysia({ name: "payout-routes" })
		.use(authPlugin)
		.post(
			"/partners/:id/payouts",
			async ({ params, body, auth }) => {
				const user = requireAuth(auth);
				assertStaffRole(user);
				const data = await container.payoutService.trigger({
					partnerId: params.id,
					amountPaise: body.amountPaise,
					triggeredBy: user.userId,
					...(body.note !== undefined ? { note: body.note } : {}),
				});
				return { success: true, data };
			},
			{
				body: t.Object({
					amountPaise: t.Number(),
					note: t.Optional(t.String()),
				}),
			},
		)
		.patch(
			"/partners/:id/payouts/:payoutId",
			async ({ params, auth }) => {
				const user = requireAuth(auth);
				assertStaffRole(user);
				const data = await container.payoutService.markPaid({
					payoutId: params.payoutId,
					paidBy: user.userId,
				});
				return { success: true, data };
			},
			{ body: t.Object({ status: t.Literal("PAID") }) },
		);
