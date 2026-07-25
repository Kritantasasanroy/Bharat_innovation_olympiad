import { describe, expect, it } from "bun:test";
import type { ApiSuccessResponse } from "@bio/admin-shared-types";
import type { PartnerInstitutionAssignment } from "../src/core/domain/partner-models";
import { buildTestHarness, jsonRequest } from "./support/build-test-app";
import { bearer } from "./support/jwt";
import { createApprovedPartnerWithCampaign, staffToken } from "./support/scenarios";

function ok<T>(response: unknown): asserts response is ApiSuccessResponse<T> {
	expect((response as { success: boolean }).success).toBe(true);
}

describe("partner<->institution self-service assignment (PRD-046)", () => {
	it("assigns and unassigns an institution, audited and visible in the read model", async () => {
		const { app, audit } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Institution Co",
		});
		const staff = staffToken();

		const assignResponse = await jsonRequest(app, "POST", `/partners/${partnerId}/institutions`, {
			body: { institutionId: "school-42" },
			headers: bearer(staff),
		});
		expect(assignResponse.status).toBe(200);
		const assignBody =
			(await assignResponse.json()) as ApiSuccessResponse<PartnerInstitutionAssignment>;
		ok(assignBody);
		expect(assignBody.data.institutionId).toBe("school-42");
		expect(assignBody.data.assignedBy).toBe("staff-1");
		expect(assignBody.data.effectiveTo).toBeNull();

		const listResponse = await jsonRequest(app, "GET", `/partners/${partnerId}/institutions`, {
			headers: bearer(ownerToken),
		});
		const listBody = (await listResponse.json()) as ApiSuccessResponse<
			PartnerInstitutionAssignment[]
		>;
		ok(listBody);
		expect(listBody.data).toHaveLength(1);
		expect(listBody.data[0]?.institutionId).toBe("school-42");

		const unassignResponse = await jsonRequest(
			app,
			"DELETE",
			`/partners/${partnerId}/institutions`,
			{
				body: { institutionId: "school-42" },
				headers: bearer(staff),
			},
		);
		expect(unassignResponse.status).toBe(200);
		const unassignBody =
			(await unassignResponse.json()) as ApiSuccessResponse<PartnerInstitutionAssignment>;
		ok(unassignBody);
		expect(unassignBody.data.effectiveTo).not.toBeNull();

		// Still visible in the read model (historical), now with effectiveTo set.
		const afterUnassign = await jsonRequest(app, "GET", `/partners/${partnerId}/institutions`, {
			headers: bearer(ownerToken),
		});
		const afterBody = (await afterUnassign.json()) as ApiSuccessResponse<
			PartnerInstitutionAssignment[]
		>;
		ok(afterBody);
		expect(afterBody.data).toHaveLength(1);
		expect(afterBody.data[0]?.effectiveTo).not.toBeNull();

		const auditedActions = audit.events.map((e) => e.action);
		expect(auditedActions).toContain("partner.institution-assigned");
		expect(auditedActions).toContain("partner.institution-unassigned");
	});

	it("rejects assigning the same institution twice while active (409)", async () => {
		const { app } = buildTestHarness();
		const { partnerId } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Duplicate Assign Co",
		});
		const staff = staffToken();

		await jsonRequest(app, "POST", `/partners/${partnerId}/institutions`, {
			body: { institutionId: "school-1" },
			headers: bearer(staff),
		});
		const duplicate = await jsonRequest(app, "POST", `/partners/${partnerId}/institutions`, {
			body: { institutionId: "school-1" },
			headers: bearer(staff),
		});
		expect(duplicate.status).toBe(409);
	});

	it("rejects a non-staff caller assigning an institution (403) and an unauthenticated one (401)", async () => {
		const { app } = buildTestHarness();
		const { partnerId, ownerToken } = await createApprovedPartnerWithCampaign(app, {
			orgName: "Self Service Denied Co",
		});

		// A partner cannot self-assign — this is staff-only self-service.
		const asOwner = await jsonRequest(app, "POST", `/partners/${partnerId}/institutions`, {
			body: { institutionId: "school-7" },
			headers: bearer(ownerToken),
		});
		expect(asOwner.status).toBe(403);

		const unauth = await jsonRequest(app, "POST", `/partners/${partnerId}/institutions`, {
			body: { institutionId: "school-7" },
		});
		expect(unauth.status).toBe(401);
	});
});
