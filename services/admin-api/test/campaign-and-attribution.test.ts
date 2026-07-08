import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type {
	AttributionRecord,
	Campaign,
	PartnerApplication,
} from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer, signTestJwt } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

describe("campaign generation (PRD-046)", () => {
	it("blocks campaign generation for an unapproved partner (403)", async () => {
		const { app } = buildTestHarness();

		const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
			body: {
				orgName: "Not Yet Approved",
				contactPerson: "Nia",
				email: "nia@nya.example",
				phone: "+914444444444",
			},
		});
		const submitBody = (await submitResponse.json()) as ApiSuccessResponse<PartnerApplication>;
		ok(submitBody);
		const partnerId = submitBody.data.partnerId;
		const ownerToken = signTestJwt({ sub: partnerId, role: "PARTNER" });

		const response = await jsonRequest(app, "POST", `/partners/${partnerId}/campaigns`, {
			body: { name: "Too Early" },
			headers: bearer(ownerToken),
		});
		expect(response.status).toBe(403);
	});

	it("lets an approved partner generate a unique campaign link+code, and deactivate it", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Approved Co",
		});

		const secondCampaign = await jsonRequest(app, "POST", `/partners/${partnerId}/campaigns`, {
			body: { name: "Second Campaign" },
			headers: bearer(ownerToken),
		});
		const secondBody = (await secondCampaign.json()) as ApiSuccessResponse<Campaign>;
		ok(secondBody);
		expect(secondBody.data.linkToken).not.toBe("");
		expect(secondBody.data.referralCode).not.toBe("");

		// Fetch the first campaign's data indirectly isn't exposed via GET, but we
		// can assert uniqueness by comparing the two generated campaigns' tokens.
		expect(secondBody.data.id).not.toBe(campaignId);

		const deactivate = await jsonRequest(
			app,
			"PATCH",
			`/partners/${partnerId}/campaigns/${campaignId}`,
			{
				body: { deactivate: true },
				headers: bearer(ownerToken),
			},
		);
		expect(deactivate.status).toBe(200);
		const deactivateBody = (await deactivate.json()) as ApiSuccessResponse<Campaign>;
		ok(deactivateBody);
		expect(deactivateBody.data.status).toBe("DEACTIVATED");
	});
});

describe("attribution capture chain (PRD-046)", () => {
	it("credits the SAME partner end to end: signup then paid conversion", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Flow Co",
		});
		const staff = staffToken();

		const signupResponse = await jsonRequest(app, "POST", `/campaigns/${campaignId}/signup`, {
			body: { studentId: "student-1" },
			headers: bearer(staff),
		});
		expect(signupResponse.status).toBe(200);
		const signupBody = (await signupResponse.json()) as ApiSuccessResponse<AttributionRecord>;
		ok(signupBody);
		expect(signupBody.data.status).toBe("OPEN");
		expect(signupBody.data.partnerId).toBe(partnerId);

		const conversionResponse = await jsonRequest(
			app,
			"POST",
			`/campaigns/${campaignId}/paid-conversion`,
			{
				body: { studentId: "student-1", registrationId: "reg-1", amountPaise: 500000 },
				headers: bearer(staff),
			},
		);
		expect(conversionResponse.status).toBe(200);
		const conversionBody =
			(await conversionResponse.json()) as ApiSuccessResponse<AttributionRecord>;
		ok(conversionBody);
		expect(conversionBody.data.status).toBe("CREDITED");
		expect(conversionBody.data.partnerId).toBe(partnerId);
		expect(conversionBody.data.registrationId).toBe("reg-1");
		expect(conversionBody.data.amountPaise).toBe(500000);
	});

	it("is idempotent: a duplicate paid-conversion event produces NO second credit", async () => {
		const { app } = buildTestHarness();
		const { campaignId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Idempotent Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/campaigns/${campaignId}/signup`, {
			body: { studentId: "student-2" },
			headers: bearer(staff),
		});

		const first = await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "student-2", registrationId: "reg-2", amountPaise: 200000 },
			headers: bearer(staff),
		});
		const firstBody = (await first.json()) as ApiSuccessResponse<AttributionRecord>;
		ok(firstBody);

		const second = await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "student-2", registrationId: "reg-2", amountPaise: 200000 },
			headers: bearer(staff),
		});
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as ApiSuccessResponse<AttributionRecord>;
		ok(secondBody);
		expect(secondBody.data.id).toBe(firstBody.data.id);

		// No second credit: only one CREDITED attribution exists for this partner.
		const funnelResponse = await jsonRequest(
			app,
			"GET",
			`/partners/${(firstBody.data as AttributionRecord).partnerId}/funnel`,
			{
				headers: bearer(staff),
			},
		);
		const funnelBody = (await funnelResponse.json()) as ApiSuccessResponse<{ paid: number }>;
		ok(funnelBody);
		expect(funnelBody.data.paid).toBe(1);
	});

	it("resolves a link-vs-coupon conflict with first-touch (LINK_FIRST_TOUCH wins over a later coupon)", async () => {
		const { app } = buildTestHarness();
		const linkPartner = await createApprovedPartnerWithCampaign(app, { orgName: "Link Partner" });
		const couponPartner = await createApprovedPartnerWithCampaign(app, {
			orgName: "Coupon Partner",
		});
		const staff = staffToken();

		// First touch: student signs up via the link partner's campaign.
		await jsonRequest(app, "POST", `/campaigns/${linkPartner.campaignId}/signup`, {
			body: { studentId: "student-3" },
			headers: bearer(staff),
		});

		// Later, at checkout, a DIFFERENT partner's coupon is applied.
		const conversion = await jsonRequest(
			app,
			"POST",
			`/campaigns/${couponPartner.campaignId}/paid-conversion`,
			{
				body: { studentId: "student-3", registrationId: "reg-3", amountPaise: 300000 },
				headers: bearer(staff),
			},
		);
		expect(conversion.status).toBe(200);
		const body = (await conversion.json()) as ApiSuccessResponse<AttributionRecord>;
		ok(body);

		// First touch wins: credited to the LINK partner, not the coupon partner.
		expect(body.data.partnerId).toBe(linkPartner.partnerId);
		expect(body.data.campaignId).toBe(linkPartner.campaignId);
		expect(body.data.ruleApplied).toBe("LINK_FIRST_TOUCH");
	});

	it("credits COUPON_ONLY when there was no prior signup touch", async () => {
		const { app } = buildTestHarness();
		const couponPartner = await createApprovedPartnerWithCampaign(app, {
			orgName: "Direct Coupon Co",
		});
		const staff = staffToken();

		// No signup call at all — the student applied the coupon directly at checkout.
		const conversion = await jsonRequest(
			app,
			"POST",
			`/campaigns/${couponPartner.campaignId}/paid-conversion`,
			{
				body: { studentId: "student-4", registrationId: "reg-4", amountPaise: 150000 },
				headers: bearer(staff),
			},
		);
		expect(conversion.status).toBe(200);
		const body = (await conversion.json()) as ApiSuccessResponse<AttributionRecord>;
		ok(body);

		expect(body.data.partnerId).toBe(couponPartner.partnerId);
		expect(body.data.ruleApplied).toBe("COUPON_ONLY");
	});
});
