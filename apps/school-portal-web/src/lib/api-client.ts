/**
 * The school portal's only network seam.
 *
 * Two public routes on the legacy backend — the platform's sole JWT signer —
 * carry the whole access loop: a school applies with no credential at all, and
 * signs in later with the access token staff issue on approval. Everything
 * behind `/dashboard` is still representative demo data (see `school-data.ts`).
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
	readonly city: string;
	readonly state: string;
	readonly coordinatorName: string;
	readonly coordinatorEmail: string;
	readonly coordinatorPhone: string;
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

export const backendApi = {
	/** Self-service access request. No credential required — this is the way in. */
	apply: (input: SchoolApplyInput) =>
		post<{ status: string; schoolName: string; coordinatorEmail: string }>("/school/apply", input),

	/** Exchange the issued access token for a session JWT. */
	login: (accessToken: string) => post<SchoolLoginResult>("/school/login", { accessToken }),
};
