import { Elysia, t } from "elysia";
import { attemptService } from "../../../container";
import { authPlugin, requireAuth } from "./auth.plugin";

/**
 * Exam-runtime HTTP routes (inbound adapter). Thin: parse/authenticate, then
 * delegate to the application services. Responses use the shared
 * `{ success, data }` envelope; domain errors are mapped by the global handler.
 */
export const attemptRoutes = new Elysia({ name: "attempt-routes" })
	.use(authPlugin)
	.post("/exams/:instanceId/start", async ({ params, auth, request }) => {
		const user = requireAuth(auth);
		const ipAddress = request.headers.get("x-forwarded-for");
		const data = await attemptService.start({
			userId: user.userId,
			instanceId: params.instanceId,
			ipAddress,
		});
		return { success: true, data };
	})
	.get("/attempts/:id", async ({ params, auth }) => {
		const user = requireAuth(auth);
		const data = await attemptService.getAttempt({ attemptId: params.id, userId: user.userId });
		return { success: true, data };
	})
	.post(
		"/attempts/:id/answer",
		async ({ params, body, auth }) => {
			const user = requireAuth(auth);
			const data = await attemptService.saveAnswer({
				attemptId: params.id,
				userId: user.userId,
				questionId: body.questionId,
				answer: body.answer,
			});
			return { success: true, data };
		},
		{ body: t.Object({ questionId: t.String(), answer: t.Unknown() }) },
	)
	.post("/attempts/:id/submit", async ({ params, auth }) => {
		const user = requireAuth(auth);
		const data = await attemptService.submit({ attemptId: params.id, userId: user.userId });
		return { success: true, data };
	});
