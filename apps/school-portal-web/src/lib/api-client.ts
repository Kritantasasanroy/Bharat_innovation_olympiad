/**
 * The school portal's only network seam.
 *
 * Two public routes on the legacy backend — the platform's sole JWT signer —
 * carry the access loop: a school applies with no credential, and signs in
 * later with the access token staff issue on approval. The authenticated
 * `portalApi.*` reads below back the dashboard, all scoped server-side to the
 * coordinator's own school; `registerStudents` is the one write a school gets.
 */
const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** NestJS error envelope: `{ statusCode, message: string | string[], error }`. */
interface NestErrorBody {
	readonly statusCode?: number;
	readonly message?: string | string[];
	readonly error?: string;
}

export class ApiError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.name = "ApiError";
		this.statusCode = statusCode;
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
			throw new ApiError("The request took too long. Check your connection and try again.", 408);
		}
		throw cause;
	} finally {
		clearTimeout(timeout);
	}
}

async function post<T>(path: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
		throw new ApiError(`Could not reach the BIO backend at ${BACKEND_API_URL}.`, 0);
	}

	const raw: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const error = (raw ?? {}) as NestErrorBody;
		const message = Array.isArray(error.message)
			? (error.message[0] ?? "Request failed.")
			: (error.message ?? `Request failed with status ${response.status}.`);
		throw new ApiError(message, response.status);
	}
	return raw as T;
}

export interface SchoolApplyInput {
	readonly schoolName: string;
	readonly board: string;
	readonly udiseCode?: string;
	readonly pincode: string;
	readonly city: string;
	readonly state: string;
	readonly coordinatorName: string;
	readonly coordinatorEmail: string;
	readonly coordinatorPhone: string;
	/** Campaign code from a partner's onboarding link (`/activate?ref=CODE`). */
	readonly referralCode?: string;
	/** Enables the email + password sign-in option alongside the access token. */
	readonly password: string;
	/** Proof the coordinator email was already confirmed — see `confirmVerification`. */
	readonly verificationTicket: string;
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

export interface PincodeLocation {
	readonly pincode: string;
	readonly city: string;
	readonly state: string;
}

export interface SchoolLoginResult {
	readonly accessToken: string;
	readonly school: {
		readonly id: string;
		readonly name: string;
		readonly code: string;
		readonly city: string;
		readonly state: string;
	};
	readonly coordinator: { readonly name: string; readonly email: string };
}

export interface SchoolApplicationResult {
	readonly status: "PENDING" | "EMAIL_VERIFICATION_REQUIRED";
	readonly schoolName: string;
	readonly coordinatorEmail: string;
	readonly emailSent: boolean;
}

/** Legacy link-based confirmation — only for a school a partner submitted on the coordinator's behalf. */
export interface EmailVerificationResult {
	readonly status: "PENDING" | "ALREADY_VERIFIED" | "SET_PASSWORD";
	readonly email: string;
	readonly emailSent?: boolean;
	readonly setPasswordTicket?: string;
}

export interface ConfirmPasswordResetResult {
	readonly status: "CONTINUE_RESET";
	readonly email: string;
	readonly resetTicket: string;
}

async function authed<T>(path: string, token: string): Promise<T> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
			headers: { authorization: `Bearer ${token}` },
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
		throw new ApiError(`Could not reach the BIO backend at ${BACKEND_API_URL}.`, 0);
	}
	const raw: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const error = (raw ?? {}) as NestErrorBody;
		const message = Array.isArray(error.message)
			? (error.message[0] ?? "Request failed.")
			: (error.message ?? `Request failed with status ${response.status}.`);
		throw new ApiError(message, response.status);
	}
	return raw as T;
}

async function authedPost<T>(path: string, token: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
			body: JSON.stringify(body),
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
		throw new ApiError(`Could not reach the BIO backend at ${BACKEND_API_URL}.`, 0);
	}
	const raw: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const error = (raw ?? {}) as NestErrorBody;
		const message = Array.isArray(error.message)
			? (error.message[0] ?? "Request failed.")
			: (error.message ?? `Request failed with status ${response.status}.`);
		throw new ApiError(message, response.status);
	}
	return raw as T;
}

export const backendApi = {
	/** Step 1 of activation: email the coordinator a 6-digit code before any school details are collected. */
	startVerification: (email: string) =>
		post<StartVerificationResult>("/school/verification/start", { email }),

	/** Step 2: check the code and get the ticket `apply()` requires. */
	confirmVerification: (email: string, code: string) =>
		post<ConfirmVerificationResult>("/school/verification/confirm", { email, code }),

	/** Step 3: the full application, authorized by the ticket `confirmVerification` returned. */
	apply: (input: SchoolApplyInput) => post<SchoolApplicationResult>("/school/apply", input),

	/** Legacy link-based confirmation, only for a school a partner submitted on the coordinator's behalf. */
	verifyEmail: (token: string) => post<EmailVerificationResult>("/school/verify-email", { token }),

	resendVerification: (email: string) =>
		post<{ status: "CHECK_INBOX" }>("/school/resend-verification", { email }),

	/** Email + password chosen at activation, or the access token issued on approval. */
	login: (coordinatorEmail: string, password: string) =>
		post<SchoolLoginResult>("/school/login", { coordinatorEmail, password }),

	loginWithToken: (accessToken: string) =>
		post<SchoolLoginResult>("/school/login", { accessToken }),

	/** Forgot-password step 1: email a 6-digit code to an existing password account. */
	forgotPassword: (email: string) =>
		post<StartVerificationResult>("/school/forgot-password", { email }),

	/** Step 2: check the code and get the ticket `resetPassword` requires. */
	confirmPasswordReset: (email: string, code: string) =>
		post<ConfirmPasswordResetResult>("/school/reset-password/confirm", { email, code }),

	/** Step 3: set the new password, authorized by the ticket `confirmPasswordReset` returned. */
	resetPassword: (email: string, resetTicket: string, newPassword: string) =>
		post<{ status: "PASSWORD_RESET" }>("/school/reset-password", {
			email,
			resetTicket,
			newPassword,
		}),

	/** First-time password creation for a partner-submitted school right after email verification. */
	setPassword: (email: string, setPasswordTicket: string, newPassword: string) =>
		post<{ status: "PASSWORD_SET" }>("/school/set-password", {
			email,
			setPasswordTicket,
			newPassword,
		}),

	/** City and state from a pincode, so a school never types them. */
	async lookupPincode(pincode: string): Promise<PincodeLocation> {
		let response: Response;
		try {
			response = await fetchWithTimeout(
				`${BACKEND_API_URL}/api/geo/pincode/${encodeURIComponent(pincode)}`,
				{},
			);
		} catch (cause) {
			if (cause instanceof ApiError) throw cause;
			throw new ApiError("Could not reach the pincode service.", 0);
		}
		const raw: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const error = (raw ?? {}) as NestErrorBody;
			const message = Array.isArray(error.message)
				? (error.message[0] ?? "Could not find that pincode.")
				: (error.message ?? "Could not find that pincode.");
			throw new ApiError(message, response.status);
		}
		return raw as PincodeLocation;
	},
};

/**
 * The school dashboard's live data. Every route is scoped server-side to the
 * coordinator's own school — the token carries the `schoolId`. All reads except
 * `registerStudents`, which is the only write a school is trusted with.
 */
export interface SupportTicket {
	readonly id: string;
	readonly category: string;
	readonly subject: string;
	readonly message: string;
	readonly status: "OPEN" | "IN_REVIEW" | "RESOLVED";
	readonly response: string | null;
	readonly createdAt: string;
}

export interface Announcement {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly audience: "PARTNER" | "SCHOOL" | "ALL";
	readonly publishedAt: string;
	readonly expiresAt: string | null;
}

async function authedPatch<T>(path: string, token: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
			method: "PATCH",
			headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
			body: JSON.stringify(body),
		});
	} catch (cause) {
		if (cause instanceof ApiError) throw cause;
		throw new ApiError(`Could not reach the BIO backend at ${BACKEND_API_URL}.`, 0);
	}
	const raw: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const error = (raw ?? {}) as NestErrorBody;
		const message = Array.isArray(error.message)
			? (error.message[0] ?? "Request failed.")
			: (error.message ?? `Request failed with status ${response.status}.`);
		throw new ApiError(message, response.status);
	}
	return raw as T;
}

/**
 * Downloads a binary response (the results workbook) and hands it to the browser
 * as a file. It cannot go through `authed`, which parses every response as JSON.
 */
async function authedDownload(path: string, token: string, filename: string): Promise<void> {
	const response = await fetchWithTimeout(`${BACKEND_API_URL}/api${path}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	if (!response.ok) {
		const raw = (await response.json().catch(() => null)) as NestErrorBody | null;
		const message = Array.isArray(raw?.message) ? raw?.message[0] : raw?.message;
		throw new ApiError(message ?? "Could not download that file.", response.status);
	}

	const url = URL.createObjectURL(await response.blob());
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

export const portalApi = {
	profile: (token: string) => authed<SchoolPortalProfile>("/school/portal/me", token),
	/** A coordinator edits its own contact details (item 14). */
	updateProfile: (token: string, input: SchoolProfileUpdate) =>
		authedPatch<SchoolPortalProfile>("/school/portal/me", token, input),
	/** Who this school's partner is — the house partner if it has none (item 10). */
	partner: (token: string) => authed<SchoolPartner>("/school/portal/partner", token),
	overview: (token: string) => authed<SchoolOverview>("/school/portal/overview", token),
	students: (token: string) => authed<PortalStudent[]>("/school/portal/students", token),
	/** Every exam's slots, how full each is, and which one this school holds (item 15). */
	slots: (token: string) => authed<SlotBoard[]>("/school/portal/slots", token),
	/** The school picks (or changes) its slot for one exam (item 15). */
	pickSlot: (token: string, examInstanceId: string, slotId: string) =>
		authedPost<PickSlotResult>("/school/portal/slots", token, { examInstanceId, slotId }),
	monitoring: (token: string) => authed<PortalMonitoring>("/school/portal/monitoring", token),
	results: (token: string) => authed<PortalResult[]>("/school/portal/results", token),
	/** Exams whose results have been released to schools (item 18). */
	resultInstances: (token: string) =>
		authed<ReleasedInstance[]>("/school/portal/results/instances", token),
	/** The school's own results for one exam, as an Excel workbook (item 16). */
	downloadResults: (token: string, examInstanceId: string, examTitle: string) =>
		authedDownload(
			`/school/portal/results/${examInstanceId}/export.xlsx`,
			token,
			`bio-results-${examTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`,
		),
	registerStudents: (token: string, students: NewStudent[]) =>
		authedPost<RegisterStudentsResult>("/school/portal/students", token, { students }),

	// Support tickets — persisted on the backend and visible to admins.
	listSupport: (token: string) => authed<SupportTicket[]>("/school/support", token),
	createSupport: (token: string, input: { category: string; subject: string; message: string }) =>
		authedPost<SupportTicket>("/school/support", token, input),

	/** Admin announcements visible to this audience. */
	announcements: (token: string) => authed<Announcement[]>("/school/portal/announcements", token),

	/** School payouts (triggered by BIO admin). */
	payouts: (token: string) => authed<Payout[]>("/school/portal/payouts", token),
	/** Masked bank details for payouts. */
	bankDetails: (token: string) => authed<BankDetails | null>("/school/portal/bank-details", token),
	/** Submit or update bank details for payouts. */
	submitBankDetails: (token: string, input: SubmitBankDetailsInput) =>
		authedPost<BankDetails>("/school/portal/bank-details", token, input),
};

export interface Payout {
	readonly id: string;
	readonly partnerId: string;
	readonly amountPaise: number;
	readonly note: string | null;
	readonly status: "TRIGGERED" | "PAID";
	readonly triggeredBy: string;
	readonly triggeredAt: string;
	readonly paidBy: string | null;
	readonly paidAt: string | null;
}

export interface BankDetails {
	readonly partnerId: string;
	readonly accountHolderName: string;
	readonly bankName: string;
	readonly ifscCode: string;
	readonly accountNumberLast4: string;
	readonly panMasked: string;
	readonly submittedAt: string;
	readonly updatedAt: string;
}

export interface SubmitBankDetailsInput {
	readonly accountHolderName: string;
	readonly bankName: string;
	readonly ifscCode: string;
	readonly accountNumber: string;
	readonly pan: string;
}

/** What a coordinator may change about their school. Name/pincode/code are staff-only. */
export interface SchoolProfileUpdate {
	readonly board?: string;
	readonly udiseCode?: string;
	readonly city?: string;
	readonly state?: string;
	readonly coordinatorName?: string;
	readonly coordinatorPhone?: string;
}

export interface SchoolPartner {
	readonly partnerId: string;
	readonly orgName: string;
	readonly contactPerson: string;
	readonly email: string;
	readonly phone: string;
	readonly portalUrl: string;
	/** True when this is the house partner rather than one that onboarded the school. */
	readonly isDefault: boolean;
	readonly label: string;
}

export interface BoardSlot {
	readonly slotId: string;
	readonly label: string | null;
	readonly startsAt: string;
	readonly endsAt: string;
	readonly capacity: number;
	readonly booked: number;
	readonly remaining: number;
	readonly fillPct: number;
	readonly isAssignedToUs: boolean;
	readonly hasEnded: boolean;
	readonly selectable: boolean;
	readonly fitsAllStudents: boolean;
}

export interface SlotBoard {
	readonly examInstanceId: string;
	readonly examId: string;
	readonly examTitle: string;
	readonly classBands: number[];
	readonly durationMinutes: number;
	readonly startsAt: string;
	readonly endsAt: string;
	readonly eligibleStudents: number;
	readonly assignedSlotId: string | null;
	readonly slots: BoardSlot[];
}

export interface PickSlotResult {
	readonly changed: boolean;
	readonly booked?: number;
	readonly summary?: {
		readonly totalStudents: number;
		readonly eligibleStudents: number;
		readonly allocated: number;
		readonly alreadyBooked: number;
		readonly noCapacity: number;
		readonly ineligible: number;
		readonly notes: string[];
	};
}

export interface ReleasedInstance {
	readonly examInstanceId: string;
	readonly examTitle: string;
	readonly totalMarks: number;
	readonly startsAt: string;
	readonly endsAt: string;
	readonly releasedAt: string;
	readonly students: number;
}

export interface SchoolPortalProfile {
	id: string;
	name: string;
	code: string;
	board: string | null;
	udiseCode: string | null;
	city: string;
	state: string;
	pincode: string;
	status: "ACTIVE" | "PENDING";
	/** Which fields the coordinator may change. Identity fields are staff-only. */
	editable: string[];
	onboardedAt: string | null;
	coordinator: { name: string; email: string; phone: string } | null;
}

export interface SchoolOverview {
	invited: number;
	registered: number;
	paid: number;
	completed: number;
}

export interface PortalStudent {
	id: string;
	name: string;
	email: string;
	classBand: number;
	status: "INVITED" | "REGISTERED" | "PAID" | "COMPLETED";
	score: number | null;
	invitedAt: string | null;
	activatedAt: string | null;
}

export interface PortalSlot {
	assignmentId: string;
	examTitle: string;
	slotId: string;
	label: string | null;
	startsAt: string;
	endsAt: string;
	capacity: number;
	booked: number;
	status: "OPEN" | "FULL";
}

export interface PortalMonitoring {
	inProgress: number;
	submitted: number;
	notStarted: number;
	live: { attemptId: string; name: string; classBand: number; startedAt: string | null }[];
}

export interface PortalResult {
	studentId: string;
	name: string;
	classBand: number;
	examTitle: string;
	totalMarks: number;
	score: number | null;
	normalizedScore: number | null;
	percentile: number | null;
	rank: number | null;
}

export interface NewStudent {
	name: string;
	email: string;
	classBand: number;
}

export interface RegisterStudentsResult {
	added: number;
	skipped: { email: string; reason: string }[];
	addedStudents: { email: string; name: string }[];
}
