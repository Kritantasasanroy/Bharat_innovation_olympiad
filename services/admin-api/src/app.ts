import { Elysia } from "elysia";
import { adminRoutes } from "./adapters/in/http/admin.routes";
import { adminRoleGuard } from "./adapters/in/http/admin-role.guard";
import { campaignEventRoutes } from "./adapters/in/http/campaign-event.routes";
import { corsPlugin } from "./adapters/in/http/cors.plugin";
import { errorHandler } from "./adapters/in/http/error-handler";
import { exportRoutes } from "./adapters/in/http/export.routes";
import { healthRoute } from "./adapters/in/http/health.route";
import { partnerRoutes } from "./adapters/in/http/partner.routes";
import { partnerApplicationRoutes } from "./adapters/in/http/partner-application.routes";
import { payoutRoutes } from "./adapters/in/http/payout.routes";
import { requestLogger } from "./adapters/in/http/request-logger.plugin";
import { container, type PartnerContainer } from "./container";

/**
 * Build the assembled Elysia application from a set of application services.
 *
 * Parametrized (rather than importing a hardcoded singleton, as
 * `services/exam-api`'s route files do) so tests can build an isolated app
 * wired against in-memory fakes instead of the real Postgres-backed
 * container — there is no real database available in this environment, and
 * the partner engine's business rules (idempotency, immutable statement
 * versioning, payout sign-off gating, cross-partner denial, ...) need to be
 * exercised end to end over real HTTP, not just unit-tested in isolation.
 *
 * Plugin order:
 *  1. CORS               — sets Access-Control-* headers before anything else
 *  2. Error handler       — catches DomainError + Elysia errors globally
 *  3. Request logger      — logs method, path, status, and duration for every request
 *  4. Health route        — public /health/* liveness and readiness probes
 *  5. Admin-role guard    — gates /admin/* behind a verified JWT admin role (health stays public)
 *  6. Admin routes        — placeholder guarded /admin/* surface
 *  7. Partner-engine routes (PRD-046) — applications, partners/campaigns/funnel/
 *     statements/institutions, payouts, exports. Each route enforces its own
 *     JWT auth + staff/partner-ownership check (see auth.plugin.ts +
 *     partner-authorization.port.ts) rather than a blanket path-prefix guard.
 */
export function buildApp(services: PartnerContainer) {
	return new Elysia()
		.use(corsPlugin)
		.use(errorHandler)
		.use(requestLogger)
		.use(healthRoute)
		.use(adminRoleGuard)
		.use(adminRoutes)
		.use(partnerApplicationRoutes(services))
		.use(partnerRoutes(services))
		.use(campaignEventRoutes(services))
		.use(payoutRoutes(services))
		.use(exportRoutes(services));
}

/** The production app, wired against the real Postgres-backed container. Exported for tests via `.handle()`. */
export const app = buildApp(container);
