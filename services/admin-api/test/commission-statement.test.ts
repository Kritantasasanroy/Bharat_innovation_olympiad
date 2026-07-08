import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type { CommissionStatement } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

describe("commission statement generation (PRD-046)", () => {
	it("generates a statement from attributed paid conversions at the configured rate", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Commission Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "s-1", registrationId: "r-1", amountPaise: 500000 },
			headers: bearer(staff),
		});

		// Default clock is fixed at 2026-06-15T00:00:00.000Z (see FakeClock) -> period "2026-06".
		const response = await jsonRequest(app, "POST", `/partners/${partnerId}/statements`, {
			body: { period: "2026-06" },
			headers: bearer(ownerToken),
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as ApiSuccessResponse<CommissionStatement>;
		ok(body);
		expect(body.data.version).toBe(1);
		expect(body.data.totalPaise).toBe(50000); // 10% of 500000
		expect(body.data.lineItems).toHaveLength(1);
		expect(body.data.lineItems[0]?.commissionPaise).toBe(50000);
	});

	it("is immutable once issued: regenerating creates a new version, never mutates the old one", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Immutable Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "s-1", registrationId: "r-1", amountPaise: 500000 },
			headers: bearer(staff),
		});

		const first = await jsonRequest(app, "POST", `/partners/${partnerId}/statements`, {
			body: { period: "2026-06" },
			headers: bearer(ownerToken),
		});
		const firstBody = (await first.json()) as ApiSuccessResponse<CommissionStatement>;
		ok(firstBody);
		const versionOneSnapshot = { ...firstBody.data };

		// A second paid conversion arrives before the statement is regenerated.
		await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "s-2", registrationId: "r-2", amountPaise: 200000 },
			headers: bearer(staff),
		});

		const second = await jsonRequest(app, "POST", `/partners/${partnerId}/statements`, {
			body: { period: "2026-06" },
			headers: bearer(ownerToken),
		});
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as ApiSuccessResponse<CommissionStatement>;
		ok(secondBody);
		expect(secondBody.data.version).toBe(2);
		expect(secondBody.data.totalPaise).toBe(70000); // 10% of (500000 + 200000)
		expect(secondBody.data.id).not.toBe(firstBody.data.id);

		const listResponse = await jsonRequest(app, "GET", `/partners/${partnerId}/statements`, {
			headers: bearer(ownerToken),
		});
		const listBody = (await listResponse.json()) as ApiSuccessResponse<CommissionStatement[]>;
		ok(listBody);
		expect(listBody.data).toHaveLength(2);

		const versionOneAfter = listBody.data.find((s) => s.version === 1);
		const versionTwoAfter = listBody.data.find((s) => s.version === 2);
		expect(versionOneAfter).toBeDefined();
		expect(versionTwoAfter).toBeDefined();
		// Version 1 is byte-for-byte unchanged after "regenerating".
		expect(versionOneAfter).toEqual(versionOneSnapshot as unknown as CommissionStatement);
	});

	it("auto-creates a payout ledger entry from the issued statement", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Payout Seed Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
			body: { studentId: "s-1", registrationId: "r-1", amountPaise: 1000000 },
			headers: bearer(staff),
		});
		const statementResponse = await jsonRequest(app, "POST", `/partners/${partnerId}/statements`, {
			body: { period: "2026-06" },
			headers: bearer(ownerToken),
		});
		const statementBody =
			(await statementResponse.json()) as ApiSuccessResponse<CommissionStatement>;
		ok(statementBody);

		const exportResponse = await jsonRequest(app, "GET", "/exports/payouts", {
			headers: bearer(staff),
		});
		expect(exportResponse.status).toBe(200);
		const csv = await exportResponse.text();
		expect(csv).toContain(statementBody.data.id);
		expect(csv).toContain(String(statementBody.data.totalPaise));
		expect(csv).toContain("PENDING");
	});
});
