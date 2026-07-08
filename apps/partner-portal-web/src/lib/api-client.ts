import type {
	Campaign,
	CampaignInput,
	CampaignUpdateInput,
	InstitutionPerformance,
	PartnerApplication,
	PartnerApplicationInput,
	PartnerFunnel,
	Statement,
	StatementRequestInput,
	SupportRequest,
	SupportRequestInput,
} from "./types";

/** Base URL of the `services/portal-api` BFF this app talks to. */
const PORTAL_API_URL = process.env.NEXT_PUBLIC_PORTAL_API_URL ?? "http://localhost:3300";

interface ApiErrorBody {
	readonly code: string;
	readonly message: string;
	readonly statusCode: number;
}

/** Thrown for any non-2xx response from portal-api; carries its error envelope. */
export class ApiError extends Error {
	readonly code: string;
	readonly statusCode: number;

	constructor(body: ApiErrorBody) {
		super(body.message);
		this.name = "ApiError";
		this.code = body.code;
		this.statusCode = body.statusCode;
	}
}

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${PORTAL_API_URL}${path}`, {
			...init,
			headers: {
				"content-type": "application/json",
				...(token ? { authorization: `Bearer ${token}` } : {}),
				...init.headers,
			},
		});
	} catch {
		throw new ApiError({
			code: "NETWORK_ERROR",
			message: `Could not reach portal-api at ${PORTAL_API_URL}. Is it running?`,
			statusCode: 0,
		});
	}

	const raw: unknown = await response.json().catch(() => null);
	const envelope = raw as
		| { success: true; data: T }
		| { success: false; error: ApiErrorBody }
		| null;

	if (!response.ok || !envelope || envelope.success === false) {
		if (envelope && envelope.success === false) throw new ApiError(envelope.error);
		throw new ApiError({
			code: "UNKNOWN",
			message: `portal-api request failed with status ${response.status}`,
			statusCode: response.status,
		});
	}
	return envelope.data;
}

/** Typed client for every partner-facing portal-api route (PRD-011). */
export const portalApi = {
	getMyApplication: (token: string) =>
		request<PartnerApplication>("/partner/applications/me", token),

	submitApplication: (token: string, input: PartnerApplicationInput) =>
		request<PartnerApplication>("/partner/applications", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),

	getInstitutions: (token: string) =>
		request<{ institutions: readonly InstitutionPerformance[] }>("/partner/institutions", token),

	getInstitution: (token: string, institutionId: string) =>
		request<InstitutionPerformance>(
			`/partner/institutions/${encodeURIComponent(institutionId)}`,
			token,
		),

	getFunnel: (token: string) => request<PartnerFunnel>("/partner/funnel", token),

	createCampaign: (token: string, input: CampaignInput) =>
		request<Campaign>("/partner/campaigns", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),

	updateCampaign: (token: string, campaignId: string, input: CampaignUpdateInput) =>
		request<Campaign>(`/partner/campaigns/${encodeURIComponent(campaignId)}`, token, {
			method: "PATCH",
			body: JSON.stringify(input),
		}),

	requestStatement: (token: string, input: StatementRequestInput) =>
		request<Statement>("/partner/statements", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),

	listStatements: (token: string) => request<Statement[]>("/partner/statements", token),

	createSupportRequest: (token: string, input: SupportRequestInput) =>
		request<SupportRequest>("/partner/support-requests", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),

	listSupportRequests: (token: string) =>
		request<SupportRequest[]>("/partner/support-requests", token),
};
