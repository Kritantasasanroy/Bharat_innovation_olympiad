import { Elysia } from "elysia";

import { attemptRoutes } from "./adapters/in/http/attempt.routes";
import { corsPlugin } from "./adapters/in/http/cors.plugin";
import { errorHandler } from "./adapters/in/http/error-handler";
import { healthRoute } from "./adapters/in/http/health.route";
import { requestLogger } from "./adapters/in/http/request-logger.plugin";
import { timerRoutes } from "./adapters/in/http/timer.routes";

/**
 * Assembled Elysia application.
 *
 * Plugin order:
 *  1. CORS          — sets Access-Control-* headers before anything else
 *  2. Error handler — catches DomainError + Elysia errors globally
 *  3. Request logger — logs method, path, status, and duration for every request
 *  4. Routes         — health, exam-runtime (attempt lifecycle), durable timer
 *
 * Exported for use in tests via `.handle()`.
 */
export const app = new Elysia()
	.use(corsPlugin)
	.use(errorHandler)
	.use(requestLogger)
	.use(healthRoute)
	.use(attemptRoutes)
	.use(timerRoutes);
