import { describe, expect, it } from "bun:test";
import { authHeader, buildTestApp, partnerToken, TEST_JWT_SECRET } from "./support/build-test-app";
import { signTestJwt } from "./support/jwt";

describe("partner auth", () => {
	it("returns 401 on a partner route with no Authorization header", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(new Request("http://localhost/partner/applications/me"));
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
	});

	it("returns 401 for a malformed token", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader("not-a-jwt"),
			}),
		);
		expect(response.status).toBe(401);
	});

	it("returns 401 for a token signed with the wrong secret", async () => {
		const { app } = buildTestApp();
		const forged = signTestJwt({ sub: "partner-1", role: "PARTNER" }, "wrong-secret");
		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", { headers: authHeader(forged) }),
		);
		expect(response.status).toBe(401);
	});

	it("returns 401 for an expired token", async () => {
		const { app } = buildTestApp();
		const expired = signTestJwt(
			{ sub: "partner-1", role: "PARTNER", exp: Math.floor(Date.now() / 1000) - 3600 },
			TEST_JWT_SECRET,
		);
		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", { headers: authHeader(expired) }),
		);
		expect(response.status).toBe(401);
	});

	it("returns 403 for a validly-signed token that is not the PARTNER role", async () => {
		const { app } = buildTestApp();
		const studentToken = signTestJwt({ sub: "user-1", role: "STUDENT" }, TEST_JWT_SECRET);
		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader(studentToken),
			}),
		);
		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body).toMatchObject({ success: false, error: { code: "PARTNER_ROLE_REQUIRED" } });
	});

	it("passes through with a valid PARTNER token (404 = no application on file yet, not an auth failure)", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader(partnerToken("partner-1")),
			}),
		);
		expect(response.status).toBe(404);
	});

	it("still leaves /health/* public with no token", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(new Request("http://localhost/health/live"));
		expect(response.status).toBe(200);
	});
});
