/**
 * Canonical API error-code set (PLAT-02 FR-1).
 *
 * Every cross-service error uses one of these codes. The value is the default
 * HTTP status a service returns when it does not override it explicitly, so a
 * code and a status never drift apart by accident.
 */
export const ERROR_CODES = {
	/** Request body / params failed schema validation. */
	VALIDATION_FAILED: 400,
	/** Request could not be parsed at all (bad JSON, wrong shape). */
	MALFORMED_REQUEST: 400,
	/** No (or invalid) credentials presented. */
	UNAUTHENTICATED: 401,
	/** Authenticated, but not allowed to perform this action. */
	FORBIDDEN: 403,
	/** Resource does not exist (or is hidden from this caller). */
	NOT_FOUND: 404,
	/** HTTP method not supported for this resource. */
	METHOD_NOT_ALLOWED: 405,
	/** State conflict (e.g. seat already held, optimistic-lock failure). */
	CONFLICT: 409,
	/** A different request already used this idempotency key. */
	IDEMPOTENCY_CONFLICT: 409,
	/** Request payload exceeds the accepted size. */
	PAYLOAD_TOO_LARGE: 413,
	/** Well-formed but semantically invalid (business-rule rejection). */
	UNPROCESSABLE_ENTITY: 422,
	/** Caller's contract major version is not understood (FR-8, fail-closed). */
	UNSUPPORTED_CONTRACT_VERSION: 422,
	/** Caller exceeded a rate limit. */
	RATE_LIMITED: 429,
	/** Unexpected server fault. */
	INTERNAL_ERROR: 500,
	/** Endpoint is defined but not yet implemented. */
	NOT_IMPLEMENTED: 501,
	/** Service temporarily unavailable (maintenance, overload). */
	SERVICE_UNAVAILABLE: 503,
	/** An upstream dependency timed out. */
	DEPENDENCY_TIMEOUT: 504,
} as const;

/** Union of every canonical error code. */
export type ErrorCode = keyof typeof ERROR_CODES;

/** Default HTTP status for a canonical error code. */
export function httpStatusForErrorCode(code: ErrorCode): number {
	return ERROR_CODES[code];
}

/** Type guard: is `value` a known canonical error code. */
export function isErrorCode(value: unknown): value is ErrorCode {
	return typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
}
