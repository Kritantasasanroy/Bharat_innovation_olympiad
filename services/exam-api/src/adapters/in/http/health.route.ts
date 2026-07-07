import { Elysia } from "elysia";

export const healthRoute = new Elysia({ name: "health" })
	.get("/health/live", () => ({ status: "ok", service: "bio-exam", check: "live" }))
	.get("/health/ready", () => ({ status: "ok", service: "bio-exam", check: "ready" }));
