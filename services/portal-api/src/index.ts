import { Elysia } from "elysia";
export const app = new Elysia().get("/health/live", () => ({
	status: "ok",
	service: "bio-portal",
}));
if (import.meta.main) app.listen(Number(process.env.PORT ?? 3000));
