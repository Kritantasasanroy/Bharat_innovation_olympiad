import type { ApiErrorResponse } from "@bio/admin-shared-types";
import { Elysia } from "elysia";

/**
 * HTTP header carrying the caller's admin role.
 *
 * Placeholder transport until real authentication (token verification,
 * session, or upstream gateway claim) is wired in. When auth lands, replace
 * the header read in {@link requireRoleGuard} with the verified claim and
 * keep the rest of the guard contract unchanged.
 */
const ADMIN_ROLE_HEADER = "x-admin-role";

/** The single role permitted to reach admin routes. */
const REQUIRED_ROLE = "admin";

/** Path prefix for routes this guard protects. */
const PROTECTED_PREFIX = "/admin";

/**
 * Build the standard 403 envelope returned when a caller lacks the role.
 *
 * Mirrors the shape produced by the global error handler so clients see a
 * single, consistent {@link ApiErrorResponse} regardless of which layer
 * rejected the request.
 */
function forbidden(message: string): ApiErrorResponse {
	return {
		success: false,
		error: { code: "FORBIDDEN", message, statusCode: 403 },
	};
}

/**
 * Require-role guard.
 *
 * Enforces that requests to admin routes (`/admin/*`) carry the required
 * admin role before any business handler runs. Every other path — notably
 * the public `/health/*` liveness and readiness probes — passes straight
 * through, so mounting this guard never gates health checks.
 *
 * The hook is registered as `global` so it applies to admin routes mounted
 * as sibling plugins in `app.ts`, and it is path-scoped to `/admin` so the
 * mount order relative to public routes does not matter.
 *
 * No auth backend is wired yet: the role is read from the
 * {@link ADMIN_ROLE_HEADER} header. A request without the `admin` role is
 * rejected with a 403 {@link ApiErrorResponse}; a valid role falls through
 * to the route handler.
 */
export const requireRoleGuard = new Elysia({ name: "require-role" }).onBeforeHandle(
	{ as: "global" },
	({ request, set }) => {
		const path = new URL(request.url).pathname;

		// Only admin routes are guarded; public paths (including /health/*)
		// are exempt regardless of mount order.
		if (path !== PROTECTED_PREFIX && !path.startsWith(`${PROTECTED_PREFIX}/`)) {
			return;
		}

		const role = request.headers.get(ADMIN_ROLE_HEADER)?.trim();
		if (role !== REQUIRED_ROLE) {
			set.status = 403;
			return forbidden("Admin role required");
		}

		// Authorised: fall through to the route handler.
		return;
	},
);
