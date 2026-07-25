import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

describe("results-worker health", () => {
	it("returns liveness status", async () => {
		const response = await app.handle(new Request("http://localhost/health/live"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ok",
			service: "results-worker",
			check: "live",
		});
	});

	it("returns readiness status", async () => {
		const response = await app.handle(new Request("http://localhost/health/ready"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ok",
			service: "results-worker",
			check: "ready",
		});
	});
});
