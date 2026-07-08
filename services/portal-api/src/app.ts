import { Elysia } from "elysia";

import { corsPlugin } from "./adapters/in/http/cors.plugin";
import { errorHandler } from "./adapters/in/http/error-handler";
import { healthRoute } from "./adapters/in/http/health.route";
import { partnerApplicationRoutes } from "./adapters/in/http/partner-application.routes";
import { partnerDashboardRoutes } from "./adapters/in/http/partner-dashboard.routes";
import { partnerSupportRoutes } from "./adapters/in/http/partner-support.routes";
import { requestLogger } from "./adapters/in/http/request-logger.plugin";
import type { AdminApiClient, SupportRequestRepository } from "./core/ports/out/index.ts";

/** Dependencies the assembled app is built from — injected so tests can supply fakes. */
export interface AppDeps {
	readonly adminApiClient: AdminApiClient;
	readonly supportRequestRepository: SupportRequestRepository;
	readonly jwtSecret: string;
}

/**
 * Assemble the Elysia application from injected dependencies.
 *
 * Plugin order:
 *  1. CORS          — sets Access-Control-* headers before anything else
 *  2. Error handler — catches DomainError + Elysia errors globally
 *  3. Request logger — logs method, path, status for every request
 *  4. Health route   — public /health/* liveness and readiness probes
 *  5. Partner routes — onboarding application, approved-partner dashboard
 *     (institutions, funnel, campaigns, statements), and the support-request
 *     form. Each route file mounts its own auth-derive scoped to `jwtSecret`
 *     (Elysia's "scoped" derive only reaches routes on the same instance
 *     chain, so every route file needs its own `.use(createAuthPlugin(...))`
 *     rather than relying on one mounted here).
 */
export function buildApp(deps: AppDeps) {
	return new Elysia()
		.use(corsPlugin)
		.use(errorHandler)
		.use(requestLogger)
		.use(healthRoute)
		.use(partnerApplicationRoutes(deps.adminApiClient, deps.jwtSecret))
		.use(partnerDashboardRoutes(deps.adminApiClient, deps.jwtSecret))
		.use(partnerSupportRoutes(deps.supportRequestRepository, deps.adminApiClient, deps.jwtSecret));
}
