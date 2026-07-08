import type { buildApp } from "../../src/app";
import { jsonRequest } from "./build-test-app";
import { bearer, signTestJwt } from "./jwt";

export interface ApprovedPartnerWithCampaign {
	readonly partnerId: string;
	readonly applicationId: string;
	readonly campaignId: string;
	readonly ownerToken: string;
	readonly staffToken: string;
}

/** A staff caller with a recognised admin role (defaults to SUPER_ADMIN). */
export function staffToken(role = "SUPER_ADMIN"): string {
	return signTestJwt({ sub: "staff-1", role });
}

/**
 * Submit + staff-approve a partner application, then create one active
 * campaign as the newly-approved partner. Shared scaffolding for the
 * attribution/funnel/commission/payout test suites, which all need an
 * approved partner + campaign as their starting state.
 */
export async function createApprovedPartnerWithCampaign(
	app: ReturnType<typeof buildApp>,
	options: { readonly orgName: string; readonly campaignName?: string } = {
		orgName: "Acme Partners",
	},
): Promise<ApprovedPartnerWithCampaign> {
	const staff = staffToken();

	const submitResponse = await jsonRequest(app, "POST", "/partner-applications", {
		body: {
			orgName: options.orgName,
			contactPerson: "Jane Doe",
			email: `${options.orgName.replace(/\s+/g, "").toLowerCase()}@example.com`,
			phone: "+911234567890",
		},
	});
	const submitBody = (await submitResponse.json()) as { data: { id: string; partnerId: string } };
	const applicationId = submitBody.data.id;
	const partnerId = submitBody.data.partnerId;
	const ownerToken = signTestJwt({ sub: partnerId, role: "PARTNER" });

	await jsonRequest(app, "PATCH", `/partner-applications/${applicationId}/status`, {
		body: { status: "APPROVED", reason: "Meets partnership criteria" },
		headers: bearer(staff),
	});

	const campaignResponse = await jsonRequest(app, "POST", `/partners/${partnerId}/campaigns`, {
		body: { name: options.campaignName ?? "Spring Drive" },
		headers: bearer(ownerToken),
	});
	const campaignBody = (await campaignResponse.json()) as { data: { id: string } };

	return {
		partnerId,
		applicationId,
		campaignId: campaignBody.data.id,
		ownerToken,
		staffToken: staff,
	};
}
