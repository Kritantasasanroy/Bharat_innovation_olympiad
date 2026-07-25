import { describe, expect, it } from "bun:test";
import type { ApiErrorResponse } from "@bio/admin-shared-types";
import { app } from "../src/app";
import { bearer, signTestJwt } from "./support/jwt";

const adminRequest = (path: string, headers?: Record<string, string>) =>
	app.handle(new Request(`http://localhost${path}`, { headers }));

describe("admin-role guard (real JWT verification)", () => {
	it("leaves /health/* public (no role required)", async () => {
		const live = await app.handle(new Request("http://localhost/health/live"));
		expect(live.status).toBe(200);

		const ready = await app.handle(new Request("http://localhost/health/ready"));
		expect(ready.status).toBe(200);
	});

	it("rejects an admin route with no bearer token (401)", async () => {
		const response = await adminRequest("/admin/exams");
		expect(response.status).toBe(401);
		const body = (await response.json()) as ApiErrorResponse;
		expect(body.success).toBe(false);
		expect(body.error.code).toBe("UNAUTHORIZED");
	});

	it("rejects an admin route carrying a non-admin role (403)", async () => {
		const token = signTestJwt({ sub: "u1", role: "STUDENT" });
		const response = await adminRequest("/admin/users", bearer(token));
		expect(response.status).toBe(403);
		const body = (await response.json()) as ApiErrorResponse;
		expect(body.success).toBe(false);
		expect(body.error.code).toBe("FORBIDDEN");
	});

	it("rejects a forged/invalid token (401)", async () => {
		const response = await adminRequest("/admin/users", {
			authorization: "Bearer not-a-real-jwt",
		});
		expect(response.status).toBe(401);
	});
});

describe("placeholder admin routes", () => {
	it("returns a NOT_IMPLEMENTED envelope once a recognised admin role passes", async () => {
		const token = signTestJwt({ sub: "admin-1", role: "SUPER_ADMIN" });
		const response = await adminRequest("/admin/exams", bearer(token));
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
		expect(unauthorised.status).toBe(401);

		const token = signTestJwt({ sub: "admin-1", role: "FINANCE" });
		const authorised = await adminRequest("/admin", bearer(token));
		expect(authorised.status).toBe(501);
	});
});
