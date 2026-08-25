import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type { BankDetails } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer, signTestJwt } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

const VALID_DETAILS = {
	accountHolderName: "Asha Rao",
	bankName: "HDFC Bank",
	ifscCode: "hdfc0001234",
	accountNumber: "123456789012",
	pan: "abcde1234f",
};

describe("partner bank details (encrypted at rest)", () => {
	it("a partner submits their own details; the masked view never carries the plaintext", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Bank Details Co",
		});

		const submit = await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: VALID_DETAILS,
			headers: bearer(ownerToken),
		});
		expect(submit.status).toBe(200);
		const submitBody = (await submit.json()) as ApiSuccessResponse<BankDetails>;
		ok(submitBody);
		expect(submitBody.data.ifscCode).toBe("HDFC0001234");
		expect(submitBody.data.accountNumberLast4).toBe("XXXXXXXX9012");
		expect(submitBody.data.panMasked).toBe("ABCDE****F");
		expect(JSON.stringify(submitBody.data)).not.toContain("123456789012");
		expect(JSON.stringify(submitBody.data)).not.toContain("ABCDE1234F");

		const staffRead = await jsonRequest(app, "GET", `/partners/${partnerId}/bank-details`, {
			headers: bearer(staffToken()),
		});
		const staffBody = (await staffRead.json()) as ApiSuccessResponse<BankDetails>;
		ok(staffBody);
		expect(JSON.stringify(staffBody.data)).not.toContain("123456789012");
	});

	it("rejects an invalid IFSC, PAN, or account number", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Bad Details Co",
		});

		const badIfsc = await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: { ...VALID_DETAILS, ifscCode: "not-an-ifsc" },
			headers: bearer(ownerToken),
		});
		expect(badIfsc.status).toBe(400);

		const badPan = await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: { ...VALID_DETAILS, pan: "12345" },
			headers: bearer(ownerToken),
		});
		expect(badPan.status).toBe(400);

		const badAccount = await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: { ...VALID_DETAILS, accountNumber: "abc" },
			headers: bearer(ownerToken),
		});
		expect(badAccount.status).toBe(400);
	});

	it("staff reveal returns the decrypted account number and PAN; the owner's own read already does too", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Reveal Co",
		});
		await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: VALID_DETAILS,
			headers: bearer(ownerToken),
		});

		const ownerRead = await jsonRequest(app, "GET", `/partners/${partnerId}/bank-details`, {
			headers: bearer(ownerToken),
		});
		const ownerBody = (await ownerRead.json()) as ApiSuccessResponse<
			BankDetails & { accountNumber: string; pan: string }
		>;
		ok(ownerBody);
		expect(ownerBody.data.accountNumber).toBe("123456789012");
		expect(ownerBody.data.pan).toBe("ABCDE1234F");

		const staffMasked = await jsonRequest(app, "GET", `/partners/${partnerId}/bank-details`, {
			headers: bearer(staffToken()),
		});
		const staffMaskedBody = (await staffMasked.json()) as ApiSuccessResponse<
			Partial<{ accountNumber: string }>
		>;
		ok(staffMaskedBody);
		expect(staffMaskedBody.data.accountNumber).toBeUndefined();

		const staffRevealed = await jsonRequest(
			app,
			"GET",
			`/partners/${partnerId}/bank-details?reveal=true`,
			{ headers: bearer(staffToken()) },
		);
		const revealedBody = (await staffRevealed.json()) as ApiSuccessResponse<{
			accountNumber: string;
			pan: string;
		}>;
		ok(revealedBody);
		expect(revealedBody.data.accountNumber).toBe("123456789012");
		expect(revealedBody.data.pan).toBe("ABCDE1234F");
	});

	it("audits a staff reveal but not the owner's own read", async () => {
		const { app, audit } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Audit Co",
		});
		await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: VALID_DETAILS,
			headers: bearer(ownerToken),
		});
		audit.events.length = 0;

		await jsonRequest(app, "GET", `/partners/${partnerId}/bank-details`, {
			headers: bearer(ownerToken),
		});
		expect(audit.events.some((e) => e.action === "bank-details.revealed")).toBe(false);

		await jsonRequest(app, "GET", `/partners/${partnerId}/bank-details?reveal=true`, {
			headers: bearer(staffToken()),
		});
		expect(audit.events.some((e) => e.action === "bank-details.revealed")).toBe(true);
	});

	it("resubmission overwrites rather than accumulating rows", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Resubmit Co",
		});
		await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: VALID_DETAILS,
			headers: bearer(ownerToken),
		});
		const resubmit = await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: { ...VALID_DETAILS, accountNumber: "999999999999", bankName: "ICICI Bank" },
			headers: bearer(ownerToken),
		});
		const resubmitBody = (await resubmit.json()) as ApiSuccessResponse<BankDetails>;
		ok(resubmitBody);
		expect(resubmitBody.data.bankName).toBe("ICICI Bank");
		expect(resubmitBody.data.accountNumberLast4).toBe("XXXXXXXX9999");
	});

	it("a stranger cannot read or submit another partner's bank details", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, { orgName: "Private Co" });
		const stranger = signTestJwt({ sub: "someone-else", role: "PARTNER" });

		const read = await jsonRequest(app, "GET", `/partners/${partnerId}/bank-details`, {
			headers: bearer(stranger),
		});
		expect(read.status).toBe(403);

		const write = await jsonRequest(app, "PUT", `/partners/${partnerId}/bank-details`, {
			body: VALID_DETAILS,
			headers: bearer(stranger),
		});
		expect(write.status).toBe(403);
	});
});
