import { describe, expect, it } from "bun:test";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer, signTestJwt } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

describe("CSV exports (PRD-046)", () => {
	it("exports attribution records as authenticated CSV", async () => {
		const { app } = buildTestHarness();
		const { campaignId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Export Attribution Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "s-1", registrationId: "r-1", amountPaise: 100000 },
			headers: bearer(staff),
		});

		const response = await jsonRequest(app, "GET", "/exports/attribution", {
			headers: bearer(staff),
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/csv");
		const csv = await response.text();
		expect(csv.split("\r\n")[0]).toContain("studentId");
		expect(csv).toContain("s-1");
		expect(csv).toContain("r-1");
		expect(csv).toContain("CREDITED");
	});

	it("exports payouts as authenticated CSV", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Export Payout Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 100000, note: "test payout" },
			headers: bearer(staff),
		});

		const response = await jsonRequest(app, "GET", "/exports/payouts", { headers: bearer(staff) });
		expect(response.status).toBe(200);
		const csv = await response.text();
		expect(csv).toContain(partnerId);
		expect(csv).toContain("TRIGGERED");
	});

	it("requires authentication and staff privilege for exports", async () => {
		const { app } = buildTestHarness();

		const unauth = await app.handle(new Request("http://localhost/exports/attribution"));
		expect(unauth.status).toBe(401);

		const nonStaff = signTestJwt({ sub: "someone", role: "STUDENT" });
		const forbidden = await jsonRequest(app, "GET", "/exports/attribution", {
			headers: bearer(nonStaff),
		});
		expect(forbidden.status).toBe(403);
	});
});
