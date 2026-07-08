import type { ApiErrorResponse } from "@bio/admin-shared-types";
import { Elysia } from "elysia";

import { ADMIN_ROLES } from "../../../core/ports/out/authorization-policy.port.ts";
import { config } from "../../../infra/config";
import { verifyJwt } from "./auth.plugin";

/**
 * Guards the `/admin/*` prefix with REAL JWT verification.
 *
 * Replaces the old `require-role.guard.ts` placeholder, which trusted a
 * caller-supplied `x-admin-role` header with zero verification. This guard
 * decodes and verifies the shared HS256 JWT via `auth.plugin.ts`'s
 * `verifyJwt` (the same verification `bio-exam` uses against the legacy
 * NestJS backend's `JWT_SECRET`) and requires the token's `role` claim to be
 * one of the recognised internal {@link ADMIN_ROLES}. Every other path —
 * notably the public `/health/*` liveness/readiness probes — passes straight
 * through.
 *
 * Verifies the token directly from `request.headers` (rather than composing
 * `authPlugin`'s `derive`) because this guard is a cross-cutting hook meant
 * to gate OTHER, separately-mounted route plugins (`admin.routes.ts`) at the
 * app root: Elysia's `{ as: "scoped" }` derive propagates exactly one plugin
 * level up, so it would never reach a sibling plugin mounted independently in
 * `app.ts`. A route-local file that both `.use(authPlugin)` and defines its
 * own handlers on the same instance (e.g. `partner.routes.ts`) doesn't hit
 * this — the derive only needs to cross one level there. This guard does,
 * so it verifies inline instead.
 */
const PROTECTED_PREFIX = "/admin";
const ADMIN_ROLE_SET: ReadonlySet<string> = new Set<string>(ADMIN_ROLES);

function unauthorized(message: string): ApiErrorResponse {
	return { success: false, error: { code: "UNAUTHORIZED", message, statusCode: 401 } };
}

function forbidden(message: string): ApiErrorResponse {
	return { success: false, error: { code: "FORBIDDEN", message, statusCode: 403 } };
}

export const adminRoleGuard = new Elysia({ name: "admin-role-guard" }).onBeforeHandle(
	{ as: "global" },
	({ request, set }) => {
		const path = new URL(request.url).pathname;

		// Only admin routes are guarded; public paths (including /health/*)
		// are exempt regardless of mount order.
		if (path !== PROTECTED_PREFIX && !path.startsWith(`${PROTECTED_PREFIX}/`)) {
			return;
		}

		const raw = request.headers.get("authorization") ?? "";
		const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
		const auth = token ? verifyJwt(token, config.jwtSecret) : null;

		if (!auth) {
			set.status = 401;
			return unauthorized("Authentication required");
		}
		if (!auth.role || !ADMIN_ROLE_SET.has(auth.role)) {
			set.status = 403;
			return forbidden("Admin role required");
		}

		// Authorised: fall through to the route handler.
		return;
	},
);
