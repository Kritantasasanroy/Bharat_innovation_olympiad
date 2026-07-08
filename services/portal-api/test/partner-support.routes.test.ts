import { describe, expect, it } from "bun:test";
import type { PartnerApplication } from "../src/core/ports/out/index.ts";
import { authHeader, buildTestApp, partnerToken } from "./support/build-test-app";

function approved(partnerId: string): PartnerApplication {
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

describe("partner support requests (submission + status only, no ticket thread)", () => {
	it("creates a support request and lists it back for the same partner", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approved("partner-a"));

		const create = await app.handle(
			new Request("http://localhost/partner/support-requests", {
				method: "POST",
				headers: { ...authHeader(partnerToken("partner-a")), "content-type": "application/json" },
				body: JSON.stringify({
					category: "PRICING",
					subject: "Discount for a new institution",
					message: "Can we get a bulk-seat discount for a 500-student institution?",
				}),
			}),
		);
		expect(create.status).toBe(200);
		const createdBody = await create.json();
		expect(createdBody.data).toMatchObject({ partnerId: "partner-a", status: "OPEN" });

		const list = await app.handle(
			new Request("http://localhost/partner/support-requests", {
				headers: authHeader(partnerToken("partner-a")),
			}),
		);
		const listBody = await list.json();
		expect(listBody.data).toHaveLength(1);
		expect(listBody.data[0].subject).toBe("Discount for a new institution");
	});

	it("never leaks one partner's support requests to another", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approved("partner-a"));
		adminApiClient.seedApplication("partner-b", approved("partner-b"));

		await app.handle(
			new Request("http://localhost/partner/support-requests", {
				method: "POST",
				headers: { ...authHeader(partnerToken("partner-a")), "content-type": "application/json" },
				body: JSON.stringify({ category: "CAMPAIGN", subject: "A's request", message: "..." }),
			}),
		);

		const bAsksForList = await app.handle(
			new Request("http://localhost/partner/support-requests", {
				headers: authHeader(partnerToken("partner-b")),
			}),
		);
		const body = await bAsksForList.json();
		expect(body.data).toHaveLength(0);
	});

	it("is gated on approved status like the rest of the dashboard", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-pending", {
			...approved("partner-pending"),
			status: "SUBMITTED",
		});

		const response = await app.handle(
			new Request("http://localhost/partner/support-requests", {
				method: "POST",
				headers: {
					...authHeader(partnerToken("partner-pending")),
					"content-type": "application/json",
				},
				body: JSON.stringify({ category: "OTHER", subject: "x", message: "y" }),
			}),
		);
		expect(response.status).toBe(403);
	});

	it("rejects an unknown category", async () => {
		const { app, adminApiClient } = buildTestApp();
		adminApiClient.seedApplication("partner-a", approved("partner-a"));
		const response = await app.handle(
			new Request("http://localhost/partner/support-requests", {
				method: "POST",
				headers: { ...authHeader(partnerToken("partner-a")), "content-type": "application/json" },
				body: JSON.stringify({ category: "TICKET", subject: "x", message: "y" }),
			}),
		);
		expect(response.status).toBe(400);
	});
});
