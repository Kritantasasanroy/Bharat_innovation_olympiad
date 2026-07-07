import { Elysia } from "elysia";

/**
 * Assembled worker application shell for `results-worker`.
 *
 * Exposes only the public liveness/readiness probes for now. The event-consumer
 * wiring stays inert until the owning PRD lands; this surface lets the platform
 * health-check the worker in the meantime.
 *
 * Exported for use in tests via `.handle()`.
 */
export const app = new Elysia()
	.get("/health/live", () => ({ status: "ok", service: "results-worker", check: "live" }))
	.get("/health/ready", () => ({ status: "ok", service: "results-worker", check: "ready" }));
