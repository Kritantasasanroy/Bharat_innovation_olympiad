import { Elysia } from "elysia";
import { timerService } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";

/**
 * Durable-timer HTTP route (PRD EXAM-04). Returns the server-authoritative
 * remaining time; the service auto-submits when the deadline has passed. The
 * client polls this instead of trusting its own clock.
 */
export const timerRoutes = new Elysia({ name: "timer-routes" })
	.use(authPlugin)
	.get("/attempts/:id/timer", async ({ params, auth }) => {
		const user = requireAuth(auth);
		const data = await timerService.getSnapshot({ attemptId: params.id, userId: user.userId });
		return { success: true, data };
	});
