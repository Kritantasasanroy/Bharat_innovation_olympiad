import type {
	Campaign,
	CampaignInput,
	CampaignUpdateInput,
	InstitutionPerformance,
	PartnerFunnel,
	Statement,
	StatementRequestInput,
	SupportRequest,
	SupportRequestInput,
} from "./types";

/** Base URL of the `services/portal-api` BFF this app talks to (dashboard data). */
const PORTAL_API_URL = process.env.NEXT_PUBLIC_PORTAL_API_URL ?? "http://localhost:3300";

/**
 * Base URL of the legacy backend, which owns partner *authentication*:
 * `POST /api/partner/apply` (public) and `POST /api/partner/login`. It is the
 * only JWT signer in the platform, so the `role: PARTNER` token every
 * portal-api call needs can only come from here.
 */
const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

/** The approved partner behind the current token (403 once access is revoked). */
export interface ApprovedPartner {
	readonly partnerId: string;
	readonly orgName: string;
	readonly email: string;
}

/** Typed client for every partner-facing portal-api route (PRD-011). */
export const portalApi = {
	/**
	 * Identity for the dashboard shell. Applying and signing in now happen against
	 * the backend (`backendApi`), so this is the only "who am I" call the portal
	 * needs — and it 403s the instant staff revoke access.
	 */
	getMe: (token: string) => request<ApprovedPartner>("/partner/me", token),

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

// ── Backend (auth) ───────────────────────────────────────────────────────────

export interface PartnerApplyInput {
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
	readonly password: string;
}

export interface PartnerLoginResult {
	readonly accessToken: string;
	readonly partner: { readonly id: string; readonly orgName: string; readonly email: string };
}

/** NestJS error envelope: `{ statusCode, message: string | string[], error }`. */
interface NestErrorBody {
	readonly statusCode?: number;
	readonly message?: string | string[];
	readonly error?: string;
}

async function backendRequest<T>(path: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${BACKEND_API_URL}/api${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		throw new ApiError({
			code: "NETWORK_ERROR",
			message: `Could not reach the BIO backend at ${BACKEND_API_URL}. Is it running?`,
			statusCode: 0,
		});
	}

	const raw: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const err = (raw ?? {}) as NestErrorBody;
		const message = Array.isArray(err.message)
			? (err.message[0] ?? "Request failed.")
			: (err.message ?? `Request failed with status ${response.status}.`);
		throw new ApiError({ code: err.error ?? "REQUEST_FAILED", message, statusCode: response.status });
	}
	return raw as T;
}

/** Partner authentication against the legacy backend (public — no token needed). */
export const backendApi = {
	/** Self-service access request. No token required — this is the way in. */
	apply: (input: PartnerApplyInput) =>
		backendRequest<{ status: string; email: string; orgName: string }>("/partner/apply", input),

	/** Email + password sign-in; only APPROVED partners receive a token. */
	login: (email: string, password: string) =>
		backendRequest<PartnerLoginResult>("/partner/login", { email, password }),
};
