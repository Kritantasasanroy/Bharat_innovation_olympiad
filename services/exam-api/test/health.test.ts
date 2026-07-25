import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

describe("bio-exam health", () => {
	it("returns liveness status", async () => {
		const response = await app.handle(new Request("http://localhost/health/live"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok", service: "bio-exam", check: "live" });
	});
});
