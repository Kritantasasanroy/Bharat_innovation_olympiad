import { describe, expect, it } from "bun:test";
import type { ApiErrorResponse } from "@bio/admin-shared-types";
import { app } from "../src/app";

const adminRequest = (path: string, headers?: Record<string, string>) =>
	app.handle(new Request(`http://localhost${path}`, { headers }));

describe("require-role guard", () => {
	it("leaves /health/* public (no role required)", async () => {
		const live = await app.handle(new Request("http://localhost/health/live"));
		expect(live.status).toBe(200);

		const ready = await app.handle(new Request("http://localhost/health/ready"));
		expect(ready.status).toBe(200);
	});

	it("rejects an admin route without the admin role", async () => {
		const response = await adminRequest("/admin/exams");
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			success: false,
			error: { code: "FORBIDDEN", message: "Admin role required", statusCode: 403 },
		});
	});

	it("rejects an admin route carrying a non-admin role", async () => {
		const response = await adminRequest("/admin/users", { "x-admin-role": "viewer" });
		expect(response.status).toBe(403);
		const body = (await response.json()) as ApiErrorResponse;
		expect(body.success).toBe(false);
		expect(body.error.code).toBe("FORBIDDEN");
	});
});

describe("placeholder admin routes", () => {
	it("returns a NOT_IMPLEMENTED envelope once the guard passes", async () => {
		const response = await adminRequest("/admin/exams", { "x-admin-role": "admin" });
		expect(response.status).toBe(501);
		expect(await response.json()).toEqual({
			success: false,
			error: {
				code: "NOT_IMPLEMENTED",
				message: "Admin exams is not implemented yet",
				statusCode: 501,
			},
		});
	});

	it("guards the admin index route too", async () => {
		const unauthorised = await adminRequest("/admin");
		expect(unauthorised.status).toBe(403);

		const authorised = await adminRequest("/admin", { "x-admin-role": "admin" });
		expect(authorised.status).toBe(501);
	});
});
