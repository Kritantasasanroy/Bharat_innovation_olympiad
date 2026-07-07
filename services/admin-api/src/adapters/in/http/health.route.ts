import { Elysia } from "elysia";

export const healthRoute = new Elysia({ name: "health" })
	.get("/health/live", () => ({ status: "ok", service: "bio-admin", check: "live" }))
	.get("/health/ready", () => ({ status: "ok", service: "bio-admin", check: "ready" }));
