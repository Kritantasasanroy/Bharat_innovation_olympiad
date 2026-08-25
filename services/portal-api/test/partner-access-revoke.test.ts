import { describe, expect, it } from "bun:test";
import type { Partner } from "../src/core/ports/out/index.ts";
import { authHeader, buildTestApp, partnerToken } from "./support/build-test-app";

function partner(partnerId: string, status: Partner["status"]): Partner {
	return {
		id: partnerId,
		orgName: `${partnerId} Org`,
		contactPerson: "Contact",
		email: `${partnerId}@example.com`,
		phone: "1",
		status,
		createdAt: new Date().toISOString(),
	};
}

const DASHBOARD_ROUTES = ["/partner/institutions", "/partner/funnel"];

/**
 * The dashboard gate reads `Partner.status` (admin-api), not the onboarding
 * application status. That is what makes a staff REVOKE take effect on the
 * partner's very next request, even though their 24h token is still valid.
 */
describe("dashboard gating on Partner.status (revoke takes effect immediately)", () => {
	for (const route of DASHBOARD_ROUTES) {
		it(`${route} returns 403 PARTNER_NOT_APPROVED when the partner is REVOKED`, async () => {
			const { app, adminApiClient } = buildTestApp();
			adminApiClient.seedPartner("p-revoked", partner("p-revoked", "REVOKED"));

			const response = await app.handle(
				new Request(`http://localhost${route}`, {
					headers: authHeader(partnerToken("p-revoked")),
				}),
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe("PARTNER_NOT_APPROVED");
		});
	}

	it("a still-valid token stops working the moment access is revoked", async () => {
		const { app, adminApiClient } = buildTestApp();
		const token = partnerToken("p-live");

		// Approved: the funnel is reachable.
		adminApiClient.seedPartner("p-live", partner("p-live", "APPROVED"));
		adminApiClient.seedFunnel("p-live", {
			partnerId: "p-live",
			totals: { leads: 1, signups: 1, paidConversions: 1 },
			campaigns: [],
			institutions: [],
			generatedAt: new Date().toISOString(),
		});
		const before = await app.handle(
			new Request("http://localhost/partner/funnel", { headers: authHeader(token) }),
		);
		expect(before.status).toBe(200);

		// Staff revokes — same token, next request is denied.
		adminApiClient.seedPartner("p-live", partner("p-live", "REVOKED"));
		const after = await app.handle(
			new Request("http://localhost/partner/funnel", { headers: authHeader(token) }),
		);
		expect(after.status).toBe(403);
	});

	it("re-granting access restores the dashboard", async () => {
		const { app, adminApiClient } = buildTestApp();
		const token = partnerToken("p-regrant");
		adminApiClient.seedFunnel("p-regrant", {
			partnerId: "p-regrant",
			totals: { leads: 0, signups: 0, paidConversions: 0 },
			campaigns: [],
			institutions: [],
			generatedAt: new Date().toISOString(),
		});

		adminApiClient.seedPartner("p-regrant", partner("p-regrant", "REVOKED"));
		const revoked = await app.handle(
			new Request("http://localhost/partner/funnel", { headers: authHeader(token) }),
		);
		expect(revoked.status).toBe(403);

		adminApiClient.seedPartner("p-regrant", partner("p-regrant", "APPROVED"));
		const restored = await app.handle(
			new Request("http://localhost/partner/funnel", { headers: authHeader(token) }),
		);
		expect(restored.status).toBe(200);
	});

	it("a partner with no engine record is denied (NOT_SUBMITTED)", async () => {
		const { app } = buildTestApp();
		const response = await app.handle(
			new Request("http://localhost/partner/funnel", {
				headers: authHeader(partnerToken("p-unknown")),
			}),
		);
		expect(response.status).toBe(403);
	});

	it("the gate is always scoped to the token's sub, never a client-supplied id", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedPartner("p-a", partner("p-a", "APPROVED"));
		adminApiClient.seedFunnel("p-a", {
			partnerId: "p-a",
			totals: { leads: 0, signups: 0, paidConversions: 0 },
			campaigns: [],
			institutions: [],
			generatedAt: new Date().toISOString(),
		});

		await app.handle(
			new Request("http://localhost/partner/funnel", { headers: authHeader(partnerToken("p-a")) }),
		);

		// Every recorded call used the token's sub.
		expect(adminApiClient.calls.every((call) => call.partnerId === "p-a")).toBe(true);
	});
});
