import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ApiErrorResponse, ApiSuccessResponse } from "@bio/admin-shared-types";
import type { PartnerApplication } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer, signTestJwt } from "./support/jwt";
import { staffToken } from "./support/scenarios";

type AppResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

describe("partner application onboarding (PRD-046)", () => {
	it("submits an application and lands in SUBMITTED; the applicant can read the status back", async () => {
		const { app } = buildTestHarness();

		const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
			body: {
				orgName: "Acme Partners",
				contactPerson: "Jane Doe",
				email: "jane@acme.example",
				phone: "+911234567890",
			},
		});
		expect(submitResponse.status).toBe(200);
		const submitBody = (await submitResponse.json()) as AppResponse<PartnerApplication>;
		expect(submitBody.success).toBe(true);
		if (!submitBody.success) throw new Error("expected success");
		expect(submitBody.data.status).toBe("SUBMITTED");
		expect(submitBody.data.orgName).toBe("Acme Partners");

		// The applicant (no account yet) can read the status back — no auth required.
		const getResponse = await app.handle(
			new Request(`http://localhost/partner-applications/${submitBody.data.id}`),
		);
		expect(getResponse.status).toBe(200);
		const getBody = (await getResponse.json()) as AppResponse<PartnerApplication>;
		expect(getBody.success).toBe(true);
		if (!getBody.success) throw new Error("expected success");
		expect(getBody.data.status).toBe("SUBMITTED");
	});

	it("staff can decide APPROVED with a mandatory reason and actor recorded (audited)", async () => {
		const { app, audit } = buildTestHarness();

		const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
			body: {
				orgName: "Beta Co",
				contactPerson: "Sam Lee",
				email: "sam@beta.example",
				phone: "+911111111111",
			},
		});
		const submitBody = (await submitResponse.json()) as AppResponse<PartnerApplication>;
		if (!submitBody.success) throw new Error("expected success");

		const staff = staffToken("SUPER_ADMIN");
		const decideResponse = await jsonRequest(
			app,
			"PATCH",
			`/partner-applications/${submitBody.data.id}/status`,
			{ body: { status: "APPROVED", reason: "Strong regional presence" }, headers: bearer(staff) },
		);
		expect(decideResponse.status).toBe(200);
		const decideBody = (await decideResponse.json()) as AppResponse<PartnerApplication>;
		if (!decideBody.success) throw new Error("expected success");
		expect(decideBody.data.status).toBe("APPROVED");
		expect(decideBody.data.decisionReason).toBe("Strong regional presence");
		expect(decideBody.data.decidedBy).toBe("staff-1");
		expect(decideBody.data.decidedAt).not.toBeNull();

		const auditedActions = audit.events.map((e) => e.action);
		expect(auditedActions).toContain("partner-application.approved");
	});

	it("rejects a decision with a missing reason (validation)", async () => {
		const { app } = buildTestHarness();
		const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
			body: {
				orgName: "Gamma LLC",
				contactPerson: "Al",
				email: "al@gamma.example",
				phone: "+910000000000",
			},
		});
		const submitBody = (await submitResponse.json()) as AppResponse<PartnerApplication>;
		if (!submitBody.success) throw new Error("expected success");

		const staff = staffToken();
		const response = await jsonRequest(
			app,
			"PATCH",
			`/partner-applications/${submitBody.data.id}/status`,
			{
				body: { status: "APPROVED", reason: "" },
				headers: bearer(staff),
			},
		);
		expect(response.status).toBe(400);
	});

	it("rejects an application decision from a non-staff caller (403) and an unauthenticated one (401)", async () => {
		const { app } = buildTestHarness();
		const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
			body: {
				orgName: "Delta Inc",
				contactPerson: "Ray",
				email: "ray@delta.example",
				phone: "+912222222222",
			},
		});
		const submitBody = (await submitResponse.json()) as AppResponse<PartnerApplication>;
		if (!submitBody.success) throw new Error("expected success");

		const unauth = await jsonRequest(
			app,
			"PATCH",
			`/partner-applications/${submitBody.data.id}/status`,
			{
				body: { status: "APPROVED", reason: "x" },
			},
		);
		expect(unauth.status).toBe(401);

		const nonStaff = signTestJwt({ sub: "random-user", role: "STUDENT" });
		const forbidden = await jsonRequest(
			app,
			"PATCH",
			`/partner-applications/${submitBody.data.id}/status`,
			{
				body: { status: "APPROVED", reason: "x" },
				headers: bearer(nonStaff),
			},
		);
		expect(forbidden.status).toBe(403);
	});

	it("cannot re-decide an already-decided application (409 conflict)", async () => {
		const { app } = buildTestHarness();
		const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
			body: {
				orgName: "Epsilon",
				contactPerson: "Wu",
				email: "wu@epsilon.example",
				phone: "+913333333333",
			},
		});
		const submitBody = (await submitResponse.json()) as AppResponse<PartnerApplication>;
		if (!submitBody.success) throw new Error("expected success");

		const staff = staffToken();
		const first = await jsonRequest(
			app,
			"PATCH",
			`/partner-applications/${submitBody.data.id}/status`,
			{
				body: { status: "APPROVED", reason: "ok" },
				headers: bearer(staff),
			},
		);
		expect(first.status).toBe(200);

		const second = await jsonRequest(
			app,
			"PATCH",
			`/partner-applications/${submitBody.data.id}/status`,
			{
				body: { status: "REJECTED", reason: "changed my mind" },
				headers: bearer(staff),
			},
		);
		expect(second.status).toBe(409);
	});

	it("has NO review UI / queue / assignment machinery — verified by absence", async () => {
		const { app } = buildTestHarness();

		// API-level absence: there is no listing/queue endpoint for applications.
		const listAttempt = await app.handle(new Request("http://localhost/partner-applications"));
		expect(listAttempt.status).toBe(404);

		const queueAttempt = await app.handle(
			new Request("http://localhost/partner-applications/queue"),
		);
		expect(queueAttempt.status).toBe(404);

		const assignAttempt = await jsonRequest(app, "POST", "/partner-applications/some-id/assign", {
			body: { reviewerId: "someone" },
			headers: bearer(staffToken()),
		});
		expect(assignAttempt.status).toBe(404);

		// File-level absence: no review-queue/assignment source files exist in the
		// HTTP adapter directory for this feature.
		const httpDir = join(import.meta.dir, "..", "src", "adapters", "in", "http");
		const files = readdirSync(httpDir);
		const suspicious = files.filter((f) => /review|queue|assignment-queue/i.test(f));
		expect(suspicious).toEqual([]);
	});
});
