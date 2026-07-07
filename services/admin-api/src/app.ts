import { Elysia } from "elysia";

import { adminRoutes } from "./adapters/in/http/admin.routes";
import { corsPlugin } from "./adapters/in/http/cors.plugin";
import { errorHandler } from "./adapters/in/http/error-handler";
import { healthRoute } from "./adapters/in/http/health.route";
import { requestLogger } from "./adapters/in/http/request-logger.plugin";
import { requireRoleGuard } from "./adapters/in/http/require-role.guard";

/**
 * Assembled Elysia application.
 *
 * Plugin order:
 *  1. CORS           — sets Access-Control-* headers before anything else
 *  2. Error handler  — catches DomainError + Elysia errors globally
 *  3. Request logger — logs method, path, status, and duration for every request
 *  4. Health route   — public /health/* liveness and readiness probes
 *  5. Require-role guard — gates /admin/* behind the admin role (health stays public)
 *  6. Admin routes   — placeholder guarded /admin/* surface (+ future feature routes)
 *
 * Exported for use in tests via `.handle()`.
 */
export const app = new Elysia()
	.use(corsPlugin)
	.use(errorHandler)
	.use(requestLogger)
	.use(healthRoute)
	.use(requireRoleGuard)
	.use(adminRoutes);
