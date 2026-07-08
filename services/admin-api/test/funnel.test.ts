import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type { PartnerFunnel } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

describe("partner funnel read-model (PRD-046)", () => {
	it("tracks signups -> registrations -> paid, with a per-campaign breakdown", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Funnel Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/campaigns/${campaignId}/signup`, {
			body: { studentId: "s-1" },
			headers: bearer(staff),
		});
		await jsonRequest(app, "POST", `/campaigns/${campaignId}/signup`, {
			body: { studentId: "s-2" },
			headers: bearer(staff),
		});
		await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "s-1", registrationId: "r-1", amountPaise: 100000 },
			headers: bearer(staff),
		});

		const response = await jsonRequest(app, "GET", `/partners/${partnerId}/funnel`, {
			headers: bearer(staff),
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as ApiSuccessResponse<PartnerFunnel>;
		ok(body);

		expect(body.data.signups).toBe(2);
		expect(body.data.registrations).toBe(1);
		expect(body.data.paid).toBe(1);
		expect(body.data.byCampaign).toHaveLength(1);
		expect(body.data.byCampaign[0]?.campaignId).toBe(campaignId);
		expect(body.data.byCampaign[0]?.signups).toBe(2);
		expect(body.data.byCampaign[0]?.paid).toBe(1);
	});

	it("denies a cross-partner read: caller's JWT sub does not own the partner (403)", async () => {
		const { app } = buildTestHarness();
		const partnerA = await createApprovedPartnerWithCampaign(app, { orgName: "Owner Co" });
		const partnerB = await createApprovedPartnerWithCampaign(app, { orgName: "Intruder Co" });

		// partnerB's own token tries to read partnerA's funnel.
		const response = await jsonRequest(app, "GET", `/partners/${partnerA.partnerId}/funnel`, {
			headers: bearer(partnerB.ownerToken),
		});
		expect(response.status).toBe(403);
	});

	it("allows staff to read any partner's funnel (override)", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Staff View Co",
		});
		const staff = staffToken("FINANCE");

		const response = await jsonRequest(app, "GET", `/partners/${partnerId}/funnel`, {
			headers: bearer(staff),
		});
		expect(response.status).toBe(200);
	});

	it("denies an unauthenticated read (401)", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, { orgName: "No Auth Co" });

		const response = await app.handle(new Request(`http://localhost/partners/${partnerId}/funnel`));
		expect(response.status).toBe(401);
	});

	it("allows the owning partner to read their own funnel", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Self Co",
		});

		const response = await jsonRequest(app, "GET", `/partners/${partnerId}/funnel`, {
			headers: bearer(ownerToken),
		});
		expect(response.status).toBe(200);
	});
});
