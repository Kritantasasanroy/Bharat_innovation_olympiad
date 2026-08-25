import { Elysia, t } from "elysia";
import type { PartnerContainer } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";
import { assertStaffRole } from "./partner-auth.helpers";

/**
 * CSV export endpoints (PRD-046): `GET /exports/:kind` for
 * `attribution | payouts`. These are cross-partner, aggregate exports —
 * authenticated AND staff-only (any recognised admin role), so a partner
 * cannot use them to see another partner's ledger. Bank details are
 * deliberately never exportable (masked-by-default extends to exports too).
 */
export const exportRoutes = (container: PartnerContainer) =>
	new Elysia({ name: "export-routes" }).use(authPlugin).get(
		"/exports/:kind",
		async ({ params, auth, set }) => {
			const user = requireAuth(auth);
			assertStaffRole(user);
			const csv = await container.exportService.export(params.kind);
			set.headers["content-type"] = "text/csv; charset=utf-8";
			set.headers["content-disposition"] = `attachment; filename="${params.kind}.csv"`;
			return csv;
		},
		{
			params: t.Object({
				kind: t.Union([t.Literal("attribution"), t.Literal("payouts")]),
			}),
		},
	);
