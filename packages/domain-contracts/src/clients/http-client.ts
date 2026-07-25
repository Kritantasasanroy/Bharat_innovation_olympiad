/**
 * Type-safe HTTP client factory for the cross-repo seams (PLAT-02 FR-9).
 *
 * `createHttpClient` builds a client from an **injected** `fetch`, a `baseUrl`,
 * and the contract version to assert. The factory performs **no network call** —
 * it only wires configuration and returns a client whose `request` method does
 * the I/O when invoked. This keeps construction pure (cheap, side-effect-free,
 * trivially testable) and lets every service inject its own `fetch` (real,
 * instrumented, or a test double).
 *
 * Each request is type-safe end to end: the caller supplies an
 * {@link EndpointSpec} carrying Zod schemas for the request body and the
 * response, and the client validates both, returning the canonical
 * {@link ApiResponse} discriminated union rather than throwing.
 *
 * ## Contract-version guard (FR-8, fail-closed)
 * Every outbound request carries the client's contract version in the
 * {@link CONTRACT_VERSION_HEADER}. When a response declares its own contract
 * version in that header, the client rejects any response whose **major** it
 * does not understand ({@link UNSUPPORTED_CONTRACT_VERSION}) before it even
 * looks at the body — an unknown major is failed closed, never best-effort
 * parsed. A response that omits the header is treated as making no version
 * assertion and is allowed (a version you cannot read is not a version you can
 * reject).
 */
import type { z } from "zod";
import {
	type ApiError,
	type ApiResponse,
	apiError,
	CONTRACT_VERSION,
	err,
	isCompatibleMajor,
	ok,
	parseContractVersion,
	parseSemVer,
} from "../../../shared-types/src/index.ts";

/** Header carrying the asserted contract version on both request and response. */
export const CONTRACT_VERSION_HEADER = "x-bio-contract-version";

/** HTTP methods the client supports. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The subset of the WHATWG `fetch` signature the client depends on. Any value
 * structurally compatible with the global `fetch` (including the global itself)
 * satisfies it, so production code passes `fetch` and tests pass a double.
 */
export type FetchLike = (
	input: string,
	init?: {
		readonly method?: string;
		readonly headers?: Record<string, string>;
		readonly body?: string;
		readonly signal?: AbortSignal;
	},
) => Promise<Response>;

/**
 * A single endpoint described by its method, path (relative to `baseUrl`), and
 * the Zod schemas that make the call type-safe. `response` validates the success
 * payload; the optional `body` validates the request payload before it is sent.
 */
export interface EndpointSpec<TResponse, TBody = never> {
	readonly method: HttpMethod;
	/** Path appended to the client `baseUrl` (leading slash optional). */
	readonly path: string;
	/** Schema the success-response body must satisfy. */
	readonly response: z.ZodType<TResponse>;
	/** Schema the request body must satisfy before serialization. */
	readonly body?: z.ZodType<TBody>;
}

/** Per-call options. All fields optional; `body` is required by the type when the spec declares one. */
export interface RequestOptions<TBody> {
	/** Request payload; validated against `spec.body` and JSON-serialized. */
	readonly body?: TBody;
	/** Query-string parameters appended to the URL. */
	readonly query?: Readonly<Record<string, string | number | boolean>>;
	/** Extra per-call headers (merged over the client default headers). */
	readonly headers?: Readonly<Record<string, string>>;
	/** Abort signal forwarded to the injected `fetch`. */
	readonly signal?: AbortSignal;
}

/** Configuration for {@link createHttpClient}. */
export interface HttpClientConfig {
	/** Origin (and optional base path) every request path is resolved against. */
	readonly baseUrl: string;
	/** Injected `fetch` implementation; never called during construction. */
	readonly fetch: FetchLike;
	/** Contract version to assert and enforce. Defaults to {@link CONTRACT_VERSION}. */
	readonly contractVersion?: string;
	/** Headers sent on every request (overridable per call). */
	readonly defaultHeaders?: Readonly<Record<string, string>>;
}

/** A configured, type-safe HTTP client. */
export interface HttpClient {
	/** The base URL every request is resolved against (normalized, no trailing slash). */
	readonly baseUrl: string;
	/** The contract version this client asserts and enforces. */
	readonly contractVersion: string;
	/**
	 * Execute one endpoint call. Returns a discriminated {@link ApiResponse}:
	 * success carries the schema-validated payload, failure carries a canonical
	 * {@link ApiError}. Never throws for transport, status, version, or
	 * validation failures — they all surface as `err(...)`.
	 */
	request<TResponse, TBody = never>(
		spec: EndpointSpec<TResponse, TBody>,
		options?: RequestOptions<TBody>,
	): Promise<ApiResponse<TResponse>>;
}

/** Strip a single trailing slash so path joins never produce `//`. */
function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

/** Join the (normalized) base URL with an endpoint path and optional query. */
function buildUrl(
	baseUrl: string,
	path: string,
	query?: Readonly<Record<string, string | number | boolean>>,
): string {
	const suffix = path.startsWith("/") ? path : `/${path}`;
	const url = `${baseUrl}${suffix}`;
	if (query === undefined) {
		return url;
	}
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		params.set(key, String(value));
	}
	const queryString = params.toString();
	return queryString === "" ? url : `${url}?${queryString}`;
}

/**
 * Enforce the contract-version guard against a response. Returns an
 * {@link ApiError} when the response declares an incompatible/unparseable major,
 * or `null` when the response is acceptable (compatible, or no header at all).
 */
function checkResponseVersion(response: Response, clientVersion: string): ApiError | null {
	const declared = response.headers.get(CONTRACT_VERSION_HEADER);
	if (declared === null || declared === "") {
		// No assertion made — nothing to reject (a version you cannot read
		// cannot be checked; we do not fail responses that simply stay silent).
		return null;
	}
	const declaredVersion = parseSemVer(declared);
	if (declaredVersion === null) {
		return apiError(
			"UNSUPPORTED_CONTRACT_VERSION",
			`Response declared an unparseable contract version: "${declared}"`,
			{ details: { declared, expected: clientVersion } },
		);
	}
	if (!isCompatibleMajor(declaredVersion, parseContractVersion(clientVersion))) {
		return apiError(
			"UNSUPPORTED_CONTRACT_VERSION",
			`Response contract version "${declared}" is incompatible with client "${clientVersion}"`,
			{ details: { declared, expected: clientVersion } },
		);
	}
	return null;
}

/** Read and JSON-parse a response body, returning `undefined` for an empty body. */
async function readJson(response: Response): Promise<{ value?: unknown; error?: string }> {
	const raw = await response.text();
	if (raw === "") {
		return {};
	}
	try {
		return { value: JSON.parse(raw) as unknown };
	} catch {
		return { error: "Response body was not valid JSON" };
	}
}

/** Map a non-2xx response to a canonical {@link ApiError}, honoring a serialized one if present. */
function errorFromResponse(response: Response, parsed: unknown): ApiError {
	// A service that speaks our contract sends back an `ApiError`-shaped body.
	if (
		typeof parsed === "object" &&
		parsed !== null &&
		"code" in parsed &&
		"message" in parsed &&
		typeof (parsed as { code: unknown }).code === "string" &&
		typeof (parsed as { message: unknown }).message === "string"
	) {
		return parsed as ApiError;
	}
	const status = response.status;
	if (status === 401) {
		return apiError("UNAUTHENTICATED", "Request was not authenticated", { statusCode: status });
	}
	if (status === 403) {
		return apiError("FORBIDDEN", "Request was forbidden", { statusCode: status });
	}
	if (status === 404) {
		return apiError("NOT_FOUND", "Resource was not found", { statusCode: status });
	}
	if (status === 409) {
		return apiError("CONFLICT", "Request conflicted with current state", { statusCode: status });
	}
	if (status === 429) {
		return apiError("RATE_LIMITED", "Request was rate limited", { statusCode: status });
	}
	if (status >= 500) {
		return apiError("INTERNAL_ERROR", `Upstream returned status ${status}`, { statusCode: status });
	}
	return apiError("VALIDATION_FAILED", `Request failed with status ${status}`, {
		statusCode: status,
	});
}

/**
 * Build a type-safe HTTP client. Pure: performs no I/O and never touches the
 * injected `fetch` until {@link HttpClient.request} is called.
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
	const baseUrl = normalizeBaseUrl(config.baseUrl);
	const contractVersion = config.contractVersion ?? CONTRACT_VERSION;
	// Fail fast on a misconfigured client version (a build-time bug, not a runtime branch).
	parseContractVersion(contractVersion);
	const fetchImpl = config.fetch;
	const defaultHeaders = config.defaultHeaders ?? {};

	return {
		baseUrl,
		contractVersion,
		async request<TResponse, TBody = never>(
			spec: EndpointSpec<TResponse, TBody>,
			options: RequestOptions<TBody> = {},
		): Promise<ApiResponse<TResponse>> {
			const url = buildUrl(baseUrl, spec.path, options.query);
			const headers: Record<string, string> = {
				...defaultHeaders,
				...options.headers,
				[CONTRACT_VERSION_HEADER]: contractVersion,
			};

			let serializedBody: string | undefined;
			if (options.body !== undefined) {
				let payload: TBody = options.body;
				if (spec.body !== undefined) {
					const validated = spec.body.safeParse(options.body);
					if (!validated.success) {
						return err(
							apiError("VALIDATION_FAILED", "Request body failed schema validation", {
								details: { issues: validated.error.issues },
							}),
						);
					}
					payload = validated.data;
				}
				serializedBody = JSON.stringify(payload);
				headers["content-type"] = "application/json";
			}

			let response: Response;
			try {
				response = await fetchImpl(url, {
					method: spec.method,
					headers,
					...(serializedBody === undefined ? {} : { body: serializedBody }),
					...(options.signal === undefined ? {} : { signal: options.signal }),
				});
			} catch (cause) {
				const aborted = cause instanceof Error && cause.name === "AbortError";
				const message = cause instanceof Error ? cause.message : String(cause);
				return err(
					aborted
						? apiError("DEPENDENCY_TIMEOUT", `Request aborted: ${message}`)
						: apiError("SERVICE_UNAVAILABLE", `Transport error: ${message}`),
				);
			}

			// Version guard runs before the body is trusted (fail-closed).
			const versionError = checkResponseVersion(response, contractVersion);
			if (versionError !== null) {
				return err(versionError);
			}

			const parsed = await readJson(response);

			if (!response.ok) {
				return err(errorFromResponse(response, parsed.value));
			}

			if (parsed.error !== undefined) {
				return err(apiError("VALIDATION_FAILED", parsed.error));
			}

			const result = spec.response.safeParse(parsed.value);
			if (!result.success) {
				return err(
					apiError("VALIDATION_FAILED", "Response body failed schema validation", {
						details: { issues: result.error.issues },
					}),
				);
			}
			return ok(result.data);
		},
	};
}
