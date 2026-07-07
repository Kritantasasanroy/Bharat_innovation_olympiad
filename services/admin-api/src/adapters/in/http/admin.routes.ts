import type { ApiErrorResponse } from "@bio/admin-shared-types";
import { Elysia } from "elysia";

/**
 * Placeholder admin routes.
 *
 * These endpoints exist so the guarded `/admin/*` surface is mounted and
 * reachable (behind {@link requireRoleGuard}) before any business logic is
 * written. Each route returns a standard {@link ApiErrorResponse} envelope
 * with code `NOT_IMPLEMENTED` (501) — there is intentionally **no business
 * handler** yet. Replace these bodies with real use-case calls as features
 * land; the route table and the ApiResponse envelope contract stay the same.
 *
 * Reaching any of these handlers means the require-role guard already passed,
 * so a 501 here proves the guarded surface is wired end to end.
 */

/** Build the standard 501 envelope for an as-yet-unimplemented endpoint. */
function notImplemented(resource: string): ApiErrorResponse {
	return {
		success: false,
		error: {
			code: "NOT_IMPLEMENTED",
			message: `${resource} is not implemented yet`,
			statusCode: 501,
		},
	};
}

export const adminRoutes = new Elysia({ name: "admin-routes", prefix: "/admin" })
	.get("/", ({ set }) => {
		set.status = 501;
		return notImplemented("Admin index");
	})
	.get("/exams", ({ set }) => {
		set.status = 501;
		return notImplemented("Admin exams");
	})
	.get("/users", ({ set }) => {
		set.status = 501;
		return notImplemented("Admin users");
	});
