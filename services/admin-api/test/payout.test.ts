import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type { buildApp } from "../src/app";
import type { CommissionStatement, PayoutLedgerEntry } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { parseCsv } from "./support/csv";
import { bearer } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

/** Issue a statement, then look up the payout ledger entry it auto-created via the CSV export. */
async function issueStatementAndFindPayoutId(
	app: ReturnType<typeof buildApp>,
	partnerId: string,
	campaignId: string,
	ownerToken: string,
	staff: string,
): Promise<{ readonly payoutId: string; readonly statementId: string }> {
	await jsonRequest(app, "POST", `/campaigns/${campaignId}/paid-conversion`, {
		body: { studentId: "s-1", registrationId: "r-1", amountPaise: 1000000 },
		headers: bearer(staff),
	});
	const statementResponse = await jsonRequest(app, "POST", `/partners/${partnerId}/statements`, {
		body: { period: "2026-06" },
		headers: bearer(ownerToken),
	});
	const statementBody = (await statementResponse.json()) as ApiSuccessResponse<CommissionStatement>;
	ok(statementBody);
	const statementId = statementBody.data.id;

	const exportResponse = await jsonRequest(app, "GET", "/exports/payouts", {
		headers: bearer(staff),
	});
	const { rows } = parseCsv(await exportResponse.text());
	const row = rows.find((r) => r["statementId"] === statementId);
	if (!row) throw new Error("payout ledger entry not found in export");
	return { payoutId: row["id"] ?? "", statementId };
}

describe("payout ledger (PRD-046)", () => {
	it("blocks RELEASED unless finance sign-off (approver + timestamp) is already set", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Payout Block Co",
		});
		const finance = staffToken("FINANCE");
		const { payoutId } = await issueStatementAndFindPayoutId(
			app,
			partnerId,
			campaignId,
			ownerToken,
			finance,
		);

		const blocked = await jsonRequest(app, "PATCH", `/payouts/${payoutId}/status`, {
			body: { status: "RELEASED" },
			headers: bearer(finance),
		});
		expect(blocked.status).toBe(409);
	});

	it("transitions PENDING -> SIGNED_OFF -> RELEASED once sign-off is recorded", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Payout Flow Co",
		});
		const finance = staffToken("FINANCE");
		const { payoutId } = await issueStatementAndFindPayoutId(
			app,
			partnerId,
			campaignId,
			ownerToken,
			finance,
		);

		const signOff = await jsonRequest(app, "PATCH", `/payouts/${payoutId}/status`, {
			body: { status: "SIGNED_OFF", approver: "finance-approver-1" },
			headers: bearer(finance),
		});
		expect(signOff.status).toBe(200);
		const signOffBody = (await signOff.json()) as ApiSuccessResponse<PayoutLedgerEntry>;
		ok(signOffBody);
		expect(signOffBody.data.status).toBe("SIGNED_OFF");
		expect(signOffBody.data.financeSignOffApprover).toBe("finance-approver-1");
		expect(signOffBody.data.financeSignOffAt).not.toBeNull();

		const release = await jsonRequest(app, "PATCH", `/payouts/${payoutId}/status`, {
			body: { status: "RELEASED" },
			headers: bearer(finance),
		});
		expect(release.status).toBe(200);
		const releaseBody = (await release.json()) as ApiSuccessResponse<PayoutLedgerEntry>;
		ok(releaseBody);
		expect(releaseBody.data.status).toBe("RELEASED");
	});

	it("rejects a payout status change from a non-finance staff role (403) and unauthenticated (401)", async () => {
		const { app } = buildTestHarness();
		const { partnerId, campaignId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Payout Auth Co",
		});
		const finance = staffToken("FINANCE");
		const { payoutId } = await issueStatementAndFindPayoutId(
			app,
			partnerId,
			campaignId,
			ownerToken,
			finance,
		);

		const contentAdmin = staffToken("CONTENT_ADMIN");
		const forbidden = await jsonRequest(app, "PATCH", `/payouts/${payoutId}/status`, {
			body: { status: "SIGNED_OFF", approver: "x" },
			headers: bearer(contentAdmin),
		});
		expect(forbidden.status).toBe(403);

		const unauth = await jsonRequest(app, "PATCH", `/payouts/${payoutId}/status`, {
			body: { status: "SIGNED_OFF", approver: "x" },
		});
		expect(unauth.status).toBe(401);
	});
});
