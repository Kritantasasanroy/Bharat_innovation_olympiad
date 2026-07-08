import { Elysia, t } from "elysia";
import type { PartnerContainer } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";
import { assertStaffRole } from "./partner-auth.helpers";

/**
 * Payout ledger status transitions (PRD-046): staff-set, audited.
 * `PATCH /payouts/:id/status` moves `PENDING -> SIGNED_OFF -> RELEASED`; the
 * service layer blocks a `RELEASED` transition unless finance sign-off
 * (approver + timestamp) is already recorded. Restricted to FINANCE/
 * SUPER_ADMIN — payout money movement is a finance-sensitive action.
 */
export const payoutRoutes = (container: PartnerContainer) =>
	new Elysia({ name: "payout-routes" }).use(authPlugin).patch(
		"/payouts/:id/status",
		async ({ params, body, auth }) => {
			const user = requireAuth(auth);
			assertStaffRole(user, ["SUPER_ADMIN", "FINANCE"]);
			const data = await container.payoutService.updateStatus({
				payoutId: params.id,
				status: body.status,
				actor: user.userId,
				...(body.approver !== undefined ? { approver: body.approver } : {}),
				...(body.reason !== undefined ? { reason: body.reason } : {}),
			});
			return { success: true, data };
		},
		{
			body: t.Object({
				status: t.Union([t.Literal("SIGNED_OFF"), t.Literal("RELEASED")]),
				approver: t.Optional(t.String()),
				reason: t.Optional(t.String()),
			}),
		},
	);
