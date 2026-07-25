import { describe, expect, it } from "bun:test";
import { app } from "./index";

describe("portal api", () => {
	it("serves health", async () => {
		const r = await app.handle(new Request("http://localhost/health/live"));
		expect(r.status).toBe(200);
	});
});
