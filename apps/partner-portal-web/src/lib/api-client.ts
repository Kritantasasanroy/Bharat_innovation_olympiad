import type {
	AssignedInstitution,
	Campaign,
	CampaignInput,
	CampaignUpdateInput,
	PartnerFunnel,
	Payout,
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

const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (cause) {
		if (cause instanceof DOMException && cause.name === "AbortError") {
			throw new ApiError({
				code: "REQUEST_TIMEOUT",
				message: "The request took too long. Check your connection and try again.",
				statusCode: 408,
			});
		}
		throw cause;
	} finally {
		clearTimeout(timeout);
	}
}

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${PORTAL_API_URL}${path}`, {
			...init,
			headers: {
				"content-type": "application/json",
				...(token ? { authorization: `Bearer ${token}` } : {}),
				...init.headers,
			},
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
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
		request<{ institutions: readonly AssignedInstitution[] }>("/partner/institutions", token),

	getInstitution: (token: string, institutionId: string) =>
		request<AssignedInstitution>(
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

	listPayouts: (token: string) => request<Payout[]>("/partner/payouts", token),

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
	/** Proof the contact email was already confirmed — see `confirmVerification`. */
	readonly verificationTicket: string;
}

export interface PartnerLoginResult {
	readonly accessToken: string;
	readonly partner: { readonly id: string; readonly orgName: string; readonly email: string };
}

export interface PartnerApplicationResult {
	readonly status: "PENDING" | "EMAIL_VERIFICATION_REQUIRED";
	readonly email: string;
	readonly orgName: string;
	readonly emailSent: boolean;
}

export interface StartVerificationResult {
	readonly sent: boolean;
	readonly expiresInSeconds: number;
}

export interface ConfirmVerificationResult {
	readonly status: "CONTINUE_APPLICATION";
	readonly email: string;
	readonly submissionTicket: string;
}

/** Legacy link-based confirmation — kept only for any application submitted before verify-first shipped. */
export interface EmailVerificationResult {
	readonly status: "PENDING" | "ALREADY_VERIFIED";
	readonly email: string;
	readonly emailSent?: boolean;
}

/** NestJS error envelope: `{ statusCode, message: string | string[], error }`. */
interface NestErrorBody {
	readonly statusCode?: number;
	readonly message?: string | string[];
	readonly error?: string;
}

async function backendRequest<T>(
	path: string,
	body: unknown,
	init: { method?: string; token?: string } = {},
): Promise<T> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
			method: init.method ?? (body === undefined ? "GET" : "POST"),
			headers: {
				"content-type": "application/json",
				...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
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
		throw new ApiError({
			code: err.error ?? "REQUEST_FAILED",
			message,
			statusCode: response.status,
		});
	}
	return raw as T;
}

/** Partner authentication against the legacy backend (public — no token needed). */
export const backendApi = {
	/** Step 1 of application: email the applicant a 6-digit code before any org details are collected. */
	startVerification: (email: string) =>
		backendRequest<StartVerificationResult>("/partner/verification/start", { email }),

	/** Step 2: check the code and get the ticket `apply()` requires. */
	confirmVerification: (email: string, code: string) =>
		backendRequest<ConfirmVerificationResult>("/partner/verification/confirm", { email, code }),

	/** Step 3: the full application, authorized by the ticket `confirmVerification` returned. */
	apply: (input: PartnerApplyInput) =>
		backendRequest<PartnerApplicationResult>("/partner/apply", input),

	/** Legacy link-based confirmation, kept only for any application submitted before verify-first shipped. */
	verifyEmail: (token: string) =>
		backendRequest<EmailVerificationResult>("/partner/verify-email", { token }),

	resendVerification: (email: string) =>
		backendRequest<{ status: "CHECK_INBOX" }>("/partner/resend-verification", { email }),

	/** Email + password sign-in; only APPROVED partners receive a token. */
	login: (email: string, password: string) =>
		backendRequest<PartnerLoginResult>("/partner/login", { email, password }),

	/** The access token staff issue on approval, exchanged for a session JWT. */
	loginWithToken: (accessToken: string) =>
		backendRequest<PartnerLoginResult>("/partner/login", { accessToken }),
};

export interface PincodeLocation {
	readonly pincode: string;
	readonly city: string;
	readonly state: string;
}

export interface PartnerSchoolInput {
	readonly schoolName: string;
	readonly board: string;
	readonly udiseCode?: string;
	readonly pincode: string;
	readonly city: string;
	readonly state: string;
	readonly coordinatorName: string;
	readonly coordinatorEmail: string;
	readonly coordinatorPhone: string;
}

export interface PartnerSchool {
	readonly id: string;
	readonly schoolName: string;
	readonly board: string;
	readonly udiseCode: string | null;
	readonly city: string;
	readonly state: string;
	readonly pincode: string;
	readonly coordinatorName: string;
	readonly coordinatorEmail: string;
	readonly coordinatorPhone: string | null;
	readonly status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
	readonly emailVerifiedAt: string | null;
	/** The campaign code the school arrived on, or null for a direct onboard. */
	readonly submittedViaReferralCode: string | null;
	readonly decisionReason: string | null;
	readonly createdAt: string;
	readonly decidedAt: string | null;
	readonly schoolCode: string | null;
}

export interface SupportTicket {
	readonly id: string;
	readonly category: string;
	readonly subject: string;
	readonly message: string;
	readonly status: "OPEN" | "IN_REVIEW" | "RESOLVED";
	readonly response: string | null;
	readonly createdAt: string;
}

export interface SupportTicketInput {
	readonly category: string;
	readonly subject: string;
	readonly message: string;
}

export interface Announcement {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly audience: "PARTNER" | "SCHOOL" | "ALL";
	readonly publishedAt: string;
	readonly expiresAt: string | null;
}

/**
 * Partner support tickets — raised against the **backend** (persisted, visible
 * to admin), replacing the old portal-api in-memory store that reached no one.
 */
export const partnerSupportApi = {
	create: (token: string, input: SupportTicketInput) =>
		backendRequest<SupportTicket>("/partner/support", input, { token }),
	list: (token: string) =>
		backendRequest<SupportTicket[]>("/partner/support", undefined, { token }),
};

export const partnerAnnouncementApi = {
	list: (token: string) =>
		backendRequest<Announcement[]>("/partner/announcements", undefined, { token }),
};

/**
 * Partners onboard schools, not just students. A partner submits a school's
 * access request; staff review it in the same queue as a self-applying school.
 * The partner never gains access to the school — the coordinator gets the token.
 */
export const partnerSchoolApi = {
	lookupPincode: (pincode: string) =>
		backendRequest<PincodeLocation>(`/geo/pincode/${encodeURIComponent(pincode)}`, undefined),

	onboard: (token: string, input: PartnerSchoolInput) =>
		backendRequest<{ status: string; schoolName: string; coordinatorEmail: string }>(
			"/partner/schools",
			input,
			{ token },
		),

	list: (token: string) =>
		backendRequest<PartnerSchool[]>("/partner/schools", undefined, { token }),
};

// ─────────────────────────────────────────────────────────────────────────────
// The partner's own footprint: its schools, their students, and released results.
// Every route is scoped server-side to the `partnerId` on the token — a partner
// cannot address another partner's schools by guessing an id.
// ─────────────────────────────────────────────────────────────────────────────

export interface PartnerOverview {
	readonly schools: number;
	readonly activeSchools: number;
	readonly students: number;
	readonly invited: number;
	readonly registered: number;
	readonly paid: number;
	readonly completed: number;
}

export interface AssignedSchool {
	readonly id: string;
	readonly name: string;
	readonly code: string;
	readonly city: string;
	readonly state: string;
	readonly pincode: string;
	readonly board: string | null;
	readonly status: "ACTIVE" | "PENDING";
	readonly onboardedAt: string | null;
	readonly memberCount: number;
}

export interface PartnerStudent {
	readonly id: string;
	readonly name: string;
	readonly email: string;
	readonly phone: string | null;
	readonly classBand: number | null;
	readonly schoolId: string | null;
	readonly schoolName: string;
	readonly schoolCode: string | null;
	readonly status: "INVITED" | "REGISTERED" | "PAID" | "COMPLETED";
	readonly invitedAt: string | null;
	readonly activatedAt: string | null;
}

export interface PartnerReleasedInstance {
	readonly examInstanceId: string;
	readonly examTitle: string;
	readonly totalMarks: number;
	readonly startsAt: string;
	readonly endsAt: string;
	readonly releasedAt: string;
	readonly students: number;
}

export interface PartnerResultRow {
	readonly studentName: string;
	readonly email: string;
	readonly classBand: number | null;
	readonly schoolName: string;
	readonly schoolCode: string;
	readonly examTitle: string;
	readonly rawScore: number | null;
	readonly maxScore: number | null;
	readonly normalizedScore: number | null;
	readonly percentile: number | null;
	readonly rank: number | null;
	readonly submittedAt: string | null;
}

export interface PartnerProfile {
	readonly id: string;
	readonly partnerId: string | null;
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
	readonly status: string;
	readonly createdAt: string;
	/** Fields this partner may change. The email is a staff-only edit. */
	readonly editable: string[];
}

export interface PartnerProfileUpdate {
	readonly orgName?: string;
	readonly contactPerson?: string;
	readonly phone?: string;
}

/**
 * Downloads the results workbook. It cannot go through `backendRequest`, which
 * parses every response as JSON.
 */
async function downloadXlsx(path: string, token: string, filename: string): Promise<void> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
			headers: { authorization: `Bearer ${token}` },
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
		throw new ApiError({
			code: "NETWORK_ERROR",
			message: `Could not reach the BIO backend at ${BACKEND_API_URL}. Is it running?`,
			statusCode: 0,
		});
	}
	if (!response.ok) {
		const raw = (await response.json().catch(() => null)) as NestErrorBody | null;
		const message = Array.isArray(raw?.message) ? raw?.message[0] : raw?.message;
		throw new ApiError({
			code: "DOWNLOAD_FAILED",
			message: message ?? "Could not download that file.",
			statusCode: response.status,
		});
	}

	const url = URL.createObjectURL(await response.blob());
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

export const partnerPortalApi = {
	overview: (token: string) =>
		backendRequest<PartnerOverview>("/partner/portal/overview", undefined, { token }),

	/** The schools assigned to this partner. */
	schools: (token: string) =>
		backendRequest<AssignedSchool[]>("/partner/portal/schools", undefined, { token }),

	/** Every student across those schools (item 9). */
	students: (token: string, schoolId?: string) =>
		backendRequest<PartnerStudent[]>(
			`/partner/portal/students${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`,
			undefined,
			{ token },
		),

	/** Exams whose results an admin has released to partners. May be none. */
	releasedInstances: (token: string) =>
		backendRequest<PartnerReleasedInstance[]>("/partner/portal/results", undefined, { token }),

	/** Student-level results for one released exam (item 17). */
	results: (token: string, examInstanceId: string) =>
		backendRequest<PartnerResultRow[]>(`/partner/portal/results/${examInstanceId}`, undefined, {
			token,
		}),

	/** The same results as a downloadable Excel workbook (item 16). */
	downloadResults: (token: string, examInstanceId: string, examTitle: string) =>
		downloadXlsx(
			`/partner/portal/results/${examInstanceId}/export.xlsx`,
			token,
			`bio-results-${examTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`,
		),

	profile: (token: string) =>
		backendRequest<PartnerProfile>("/partner/portal/profile", undefined, { token }),

	/** A partner edits its own contact details (item 14). */
	updateProfile: (token: string, input: PartnerProfileUpdate) =>
		backendRequest<PartnerProfile>("/partner/portal/profile", input, {
			token,
			method: "PATCH",
		}),
};
