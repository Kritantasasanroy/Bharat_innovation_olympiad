import { describe, expect, it } from "bun:test";
import type { PartnerApplication, PartnerFunnel } from "../src/core/ports/out/index.ts";
import { authHeader, buildTestApp, partnerToken } from "./support/build-test-app";

function approvedApplication(partnerId: string): PartnerApplication {
	return {
		partnerId,
		orgName: `${partnerId} Org`,
		contactPerson: "Contact",
		email: `${partnerId}@example.com`,
		phone: "1",
		status: "APPROVED",
		submittedAt: new Date().toISOString(),
	};
}

function fundedFunnel(partnerId: string, seed: number): PartnerFunnel {
	return {
		partnerId,
		totals: { leads: seed * 10, signups: seed * 5, paidConversions: seed },
		campaigns: [
			{
				campaignId: `camp-${partnerId}`,
				name: `${partnerId} campaign`,
				code: `${partnerId.toUpperCase()}-CODE`,
				shareUrl: `https://portal.bio.example.com/r/${partnerId}`,
				status: "ACTIVE",
				leads: seed * 10,
				signups: seed * 5,
				paidConversions: seed,
			},
		],
		institutions: [
			{
				institutionId: `inst-${partnerId}`,
				institutionName: `${partnerId} Institution`,
				leads: seed * 10,
				signups: seed * 5,
				paidConversions: seed,
			},
		],
		generatedAt: new Date().toISOString(),
	};
}

const DASHBOARD_ROUTES = ["/partner/institutions", "/partner/funnel", "/partner/statements"];

describe("dashboard gating on approved status", () => {
	for (const route of DASHBOARD_ROUTES) {
		it(`${route} returns 403 PARTNER_NOT_APPROVED for a SUBMITTED application`, async () => {
			const { app, adminApiClient } = buildTestApp();
			adminApiClient.seedApplication("partner-pending", {
				...approvedApplication("partner-pending"),
				status: "SUBMITTED",
			});
			const response = await app.handle(
				new Request(`http://localhost${route}`, {
					headers: authHeader(partnerToken("partner-pending")),
				}),
			);
			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body.error.code).toBe("PARTNER_NOT_APPROVED");
		});

		it(`${route} returns 403 PARTNER_NOT_APPROVED for a REJECTED application`, async () => {
			const { app, adminApiClient } = buildTestApp();
			adminApiClient.seedApplication("partner-rejected", {
				...approvedApplication("partner-rejected"),
				status: "REJECTED",
			});
			const response = await app.handle(
				new Request(`http://localhost${route}`, {
					headers: authHeader(partnerToken("partner-rejected")),
				}),
			);
			expect(response.status).toBe(403);
		});

		it(`${route} returns 403 PARTNER_NOT_APPROVED when no application was ever submitted`, async () => {
			const { app } = buildTestApp();
			const response = await app.handle(
				new Request(`http://localhost${route}`, {
					headers: authHeader(partnerToken("partner-never-applied")),
				}),
			);
			expect(response.status).toBe(403);
		});
	}

	it("GET /partner/funnel succeeds (200) once the application is APPROVED", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-ok", approvedApplication("partner-ok"));
		adminApiClient.seedFunnel("partner-ok", fundedFunnel("partner-ok", 3));
		const response = await app.handle(
			new Request("http://localhost/partner/funnel", {
				headers: authHeader(partnerToken("partner-ok")),
			}),
		);
		expect(response.status).toBe(200);
	});
});

describe("no cross-partner leakage across the dashboard", () => {
	it("funnel: two different tokens only ever see their own partner's data", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approvedApplication("partner-a"));
		adminApiClient.seedApplication("partner-b", approvedApplication("partner-b"));
		adminApiClient.seedFunnel("partner-a", fundedFunnel("partner-a", 1));
		adminApiClient.seedFunnel("partner-b", fundedFunnel("partner-b", 99));

		const asA = await app.handle(
			new Request("http://localhost/partner/funnel", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		const bodyA = await asA.json();
		expect(bodyA.data.partnerId).toBe("partner-a");
		expect(bodyA.data.totals.paidConversions).toBe(1);

		const asB = await app.handle(
			new Request("http://localhost/partner/funnel", {
				headers: authHeader(partnerToken("partner-b")),
			}),
		);
		const bodyB = await asB.json();
		expect(bodyB.data.partnerId).toBe("partner-b");
		expect(bodyB.data.totals.paidConversions).toBe(99);

		const funnelCalls = adminApiClient.calls.filter((call) => call.method === "getFunnel");
		expect(funnelCalls.map((call) => call.partnerId)).toEqual(["partner-a", "partner-b"]);
	});

	it("institutions: a query-string partnerId from the client is ignored — the token's sub always wins", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approvedApplication("partner-a"));
		adminApiClient.seedApplication("partner-b", approvedApplication("partner-b"));
		adminApiClient.seedFunnel("partner-a", fundedFunnel("partner-a", 1));
		adminApiClient.seedFunnel("partner-b", fundedFunnel("partner-b", 99));

		// Attempt to smuggle partner-b's id in as a query param while authenticated as partner-a.
		const response = await app.handle(
			new Request("http://localhost/partner/institutions?partnerId=partner-b", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		const body = await response.json();
		expect(body.data.institutions).toEqual(fundedFunnel("partner-a", 1).institutions);

		const institutionCalls = adminApiClient.calls.filter((call) => call.method === "getFunnel");
		expect(institutionCalls).toHaveLength(1);
		expect(institutionCalls[0]?.partnerId).toBe("partner-a");
	});

	it("statements: two partners' statement lists never cross", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approvedApplication("partner-a"));
		adminApiClient.seedApplication("partner-b", approvedApplication("partner-b"));
		adminApiClient.seedStatements("partner-a", [
			{
				id: "stmt-a-1",
				partnerId: "partner-a",
				periodStart: "2026-01-01",
				periodEnd: "2026-01-31",
				currency: "INR",
				totalCommission: 1000,
				payoutStatus: "RELEASED",
				financeSignOff: true,
				downloadUrl: "https://files.example.com/stmt-a-1.pdf",
				generatedAt: new Date().toISOString(),
			},
		]);
		adminApiClient.seedStatements("partner-b", [
			{
				id: "stmt-b-1",
				partnerId: "partner-b",
				periodStart: "2026-01-01",
				periodEnd: "2026-01-31",
				currency: "INR",
				totalCommission: 2000,
				payoutStatus: "PENDING",
				financeSignOff: false,
				downloadUrl: null,
				generatedAt: new Date().toISOString(),
			},
		]);

		const asA = await app.handle(
			new Request("http://localhost/partner/statements", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		const bodyA = await asA.json();
		expect(bodyA.data).toHaveLength(1);
		expect(bodyA.data[0].partnerId).toBe("partner-a");

		const asB = await app.handle(
			new Request("http://localhost/partner/statements", {
				headers: authHeader(partnerToken("partner-b")),
			}),
		);
		const bodyB = await asB.json();
		expect(bodyB.data).toHaveLength(1);
		expect(bodyB.data[0].partnerId).toBe("partner-b");
	});

	it("campaigns: creating a campaign is always scoped to the caller's own partnerId", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approvedApplication("partner-a"));

		const response = await app.handle(
			new Request("http://localhost/partner/campaigns", {
				method: "POST",
				headers: { ...authHeader(partnerToken("partner-a")), "content-type": "application/json" },
				body: JSON.stringify({ name: "Summer referral drive" }),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.partnerId).toBe("partner-a");

		const createCalls = adminApiClient.calls.filter((call) => call.method === "createCampaign");
		expect(createCalls).toEqual([
			expect.objectContaining({ method: "createCampaign", partnerId: "partner-a" }),
		]);
	});
});

describe("GET /partner/institutions/:institutionId", () => {
	it("returns 404 for an institution id that does not belong to the caller", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approvedApplication("partner-a"));
		adminApiClient.seedFunnel("partner-a", fundedFunnel("partner-a", 1));

		const response = await app.handle(
			new Request("http://localhost/partner/institutions/inst-partner-b", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		expect(response.status).toBe(404);
	});

	it("returns the institution detail when it belongs to the caller", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approvedApplication("partner-a"));
		adminApiClient.seedFunnel("partner-a", fundedFunnel("partner-a", 1));

		const response = await app.handle(
			new Request("http://localhost/partner/institutions/inst-partner-a", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.institutionId).toBe("inst-partner-a");
	});
});
