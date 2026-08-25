import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type { Payout } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer, signTestJwt } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

describe("payouts (admin-triggered, no commission engine)", () => {
	it("trigger creates a TRIGGERED payout with the admin-chosen amount and note", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, { orgName: "Payout Co" });
		const staff = staffToken();

		const response = await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 500000, note: "August referrals" },
			headers: bearer(staff),
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as ApiSuccessResponse<Payout>;
		ok(body);
		expect(body.data.status).toBe("TRIGGERED");
		expect(body.data.amountPaise).toBe(500000);
		expect(body.data.note).toBe("August referrals");
		expect(body.data.paidAt).toBeNull();
	});

	it("rejects a non-positive amount", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Bad Amount Co",
		});

		const response = await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 0 },
			headers: bearer(staffToken()),
		});
		expect(response.status).toBe(400);
	});

	it("marks a triggered payout paid, and refuses to pay it twice", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, { orgName: "Mark Paid Co" });
		const staff = staffToken();

		const triggered = await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 250000 },
			headers: bearer(staff),
		});
		const triggeredBody = (await triggered.json()) as ApiSuccessResponse<Payout>;
		ok(triggeredBody);
		const payoutId = triggeredBody.data.id;

		const paid = await jsonRequest(app, "PATCH", `/partners/${partnerId}/payouts/${payoutId}`, {
			body: { status: "PAID" },
			headers: bearer(staff),
		});
		expect(paid.status).toBe(200);
		const paidBody = (await paid.json()) as ApiSuccessResponse<Payout>;
		ok(paidBody);
		expect(paidBody.data.status).toBe("PAID");
		expect(paidBody.data.paidAt).not.toBeNull();

		const again = await jsonRequest(app, "PATCH", `/partners/${partnerId}/payouts/${payoutId}`, {
			body: { status: "PAID" },
			headers: bearer(staff),
		});
		expect(again.status).toBe(409);
	});

	it("rejects trigger and mark-paid from a non-staff caller (403) and unauthenticated (401)", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Payout Auth Co",
		});

		const asOwner = await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 1000 },
			headers: bearer(ownerToken),
		});
		expect(asOwner.status).toBe(403);

		const unauth = await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 1000 },
		});
		expect(unauth.status).toBe(401);
	});

	it("lists a partner's payouts, scoped by ownership (admin visibility)", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Payout List Co",
		});
		const staff = staffToken();
		await jsonRequest(app, "POST", `/partners/${partnerId}/payouts`, {
			body: { amountPaise: 100000 },
			headers: bearer(staff),
		});

		const asOwner = await jsonRequest(app, "GET", `/partners/${partnerId}/payouts`, {
			headers: bearer(ownerToken),
		});
		expect(asOwner.status).toBe(200);
		const ownerBody = (await asOwner.json()) as ApiSuccessResponse<Payout[]>;
		ok(ownerBody);
		expect(ownerBody.data).toHaveLength(1);

		const asStaff = await jsonRequest(app, "GET", `/partners/${partnerId}/payouts`, {
			headers: bearer(staffToken("SUPER_ADMIN")),
		});
		expect(asStaff.status).toBe(200);

		const stranger = signTestJwt({ sub: "someone-else", role: "PARTNER" });
		const forbidden = await jsonRequest(app, "GET", `/partners/${partnerId}/payouts`, {
			headers: bearer(stranger),
		});
		expect(forbidden.status).toBe(403);
	});
});
