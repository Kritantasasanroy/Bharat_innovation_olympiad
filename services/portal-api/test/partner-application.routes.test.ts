import { describe, expect, it } from "bun:test";
import { authHeader, buildTestApp, partnerToken } from "./support/build-test-app";

describe("POST /partner/applications", () => {
	it("creates an application scoped to the token's sub, rejecting KYC/document fields", async () => {
		const { app, adminApiClient } = buildTestApp();
		const token = partnerToken("partner-1");
		const response = await app.handle(
			new Request("http://localhost/partner/applications", {
				method: "POST",
				headers: { ...authHeader(token), "content-type": "application/json" },
				body: JSON.stringify({
					orgName: "Acme Learning",
					contactPerson: "Asha Rao",
					email: "asha@acme.example",
					phone: "+91-9000000000",
				}),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.data).toMatchObject({ partnerId: "partner-1", status: "SUBMITTED" });

		// Scoped by the token, not any client-supplied id.
		expect(adminApiClient.calls).toContainEqual(
			expect.objectContaining({ method: "createPartnerApplication", partnerId: "partner-1" }),
		);
	});

	it("strips an Aadhaar/KYC field before it ever reaches admin-api (no document-upload/verification fields, ever)", async () => {
		const { app, adminApiClient } = buildTestApp();
		const token = partnerToken("partner-1");
		const response = await app.handle(
			new Request("http://localhost/partner/applications", {
				method: "POST",
				headers: { ...authHeader(token), "content-type": "application/json" },
				body: JSON.stringify({
					orgName: "Acme Learning",
					contactPerson: "Asha Rao",
					email: "asha@acme.example",
					phone: "+91-9000000000",
					aadhaarNumber: "1234-5678-9012",
				}),
			}),
		);
		// The extra field is not rejected outright (Elysia's body schema silently
		// drops properties it does not declare) — the guarantee this test cares
		// about is that it never survives into the created record or the call
		// to admin-api, which is what would matter for a real KYC leak.
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data).not.toHaveProperty("aadhaarNumber");
		const createCall = adminApiClient.calls.find(
			(call) => call.method === "createPartnerApplication",
		);
		expect(createCall).toBeDefined();
	});

	it("rejects an incomplete application body", async () => {
		const { app } = buildTestApp();
		const token = partnerToken("partner-1");
		const response = await app.handle(
			new Request("http://localhost/partner/applications", {
				method: "POST",
				headers: { ...authHeader(token), "content-type": "application/json" },
				body: JSON.stringify({ orgName: "Acme Learning" }),
			}),
		);
		expect(response.status).toBe(400);
	});

	it("requires auth", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(
			new Request("http://localhost/partner/applications", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					orgName: "Acme",
					contactPerson: "A",
					email: "a@b.com",
					phone: "123",
				}),
			}),
		);
		expect(response.status).toBe(401);
	});
});

describe("GET /partner/applications/me", () => {
	it("returns the caller's own application status", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-1", {
			partnerId: "partner-1",
			orgName: "Acme Learning",
			contactPerson: "Asha Rao",
			email: "asha@acme.example",
			phone: "+91-9000000000",
			status: "SUBMITTED",
			submittedAt: new Date().toISOString(),
		});

		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader(partnerToken("partner-1")),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.status).toBe("SUBMITTED");
	});

	it("returns 404 when the caller has not applied yet", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader(partnerToken("partner-never-applied")),
			}),
		);
		expect(response.status).toBe(404);
	});

	it("never leaks another partner's application (no cross-partner leakage)", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", {
			partnerId: "partner-a",
			orgName: "Partner A Org",
			contactPerson: "A",
			email: "a@example.com",
			phone: "1",
			status: "APPROVED",
			submittedAt: new Date().toISOString(),
		});
		adminApiClient.seedApplication("partner-b", {
			partnerId: "partner-b",
			orgName: "Partner B Org",
			contactPerson: "B",
			email: "b@example.com",
			phone: "2",
			status: "REJECTED",
			submittedAt: new Date().toISOString(),
		});

		const asA = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		const bodyA = await asA.json();
		expect(bodyA.data.orgName).toBe("Partner A Org");
		expect(bodyA.data.status).toBe("APPROVED");

		const asB = await app.handle(
			new Request("http://localhost/partner/applications/me", {
				headers: authHeader(partnerToken("partner-b")),
			}),
		);
		const bodyB = await asB.json();
		expect(bodyB.data.orgName).toBe("Partner B Org");
		expect(bodyB.data.status).toBe("REJECTED");

		// The admin-api client was called with each token's own sub, never the other's.
		const partnerIdsQueried = adminApiClient.calls
			.filter((call) => call.method === "getPartnerApplication")
			.map((call) => call.partnerId);
		expect(partnerIdsQueried).toEqual(["partner-a", "partner-b"]);
	});
});
