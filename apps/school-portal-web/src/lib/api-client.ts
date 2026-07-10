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

async function post<T>(path: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${BACKEND_API_URL}/api${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
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

async function authed<T>(path: string, token: string): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${BACKEND_API_URL}/api${path}`, {
			headers: { authorization: `Bearer ${token}` },
		});
	} catch {
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
		response = await fetch(`${BACKEND_API_URL}/api${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
			body: JSON.stringify(body),
		});
	} catch {
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
	/** Self-service access request. No credential required — this is the way in. */
	apply: (input: SchoolApplyInput) =>
		post<{ status: string; schoolName: string; coordinatorEmail: string }>("/school/apply", input),

	/** Exchange the issued access token for a session JWT. */
	login: (accessToken: string) => post<SchoolLoginResult>("/school/login", { accessToken }),

	/** City and state from a pincode, so a school never types them. */
	async lookupPincode(pincode: string): Promise<PincodeLocation> {
		let response: Response;
		try {
			response = await fetch(`${BACKEND_API_URL}/api/geo/pincode/${encodeURIComponent(pincode)}`);
		} catch {
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
export const portalApi = {
	profile: (token: string) => authed<SchoolPortalProfile>("/school/portal/me", token),
	overview: (token: string) => authed<SchoolOverview>("/school/portal/overview", token),
	students: (token: string) => authed<PortalStudent[]>("/school/portal/students", token),
	slots: (token: string) => authed<PortalSlot[]>("/school/portal/slots", token),
	monitoring: (token: string) => authed<PortalMonitoring>("/school/portal/monitoring", token),
	results: (token: string) => authed<PortalResult[]>("/school/portal/results", token),
	registerStudents: (token: string, students: NewStudent[]) =>
		authedPost<RegisterStudentsResult>("/school/portal/students", token, { students }),
};

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
	readOnly: boolean;
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
