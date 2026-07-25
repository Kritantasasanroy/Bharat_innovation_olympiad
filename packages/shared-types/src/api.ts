import { type ErrorCode, httpStatusForErrorCode } from "./error-codes.ts";

/**
 * Canonical API error shape (PLAT-02 FR-1).
 *
 * `correlationId` ties an error back to the trace/log envelope (PLAT-04) so a
 * support or on-call engineer can pivot from a client-visible failure to the
 * full request trace. It is optional because errors raised before a correlation
 * id is established (e.g. malformed inbound request) still need to serialize.
 */
export interface ApiError {
	readonly code: ErrorCode;
	readonly message: string;
	readonly statusCode: number;
	readonly correlationId?: string;
	/** Structured, redaction-safe extra context (never secrets/PII). */
	readonly details?: Readonly<Record<string, unknown>>;
}

/** Options for {@link apiError}; `statusCode` defaults to the code's canonical status. */
export interface ApiErrorOptions {
	readonly statusCode?: number;
	readonly correlationId?: string;
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Build an {@link ApiError}, defaulting `statusCode` from the canonical
 * error-code table so callers cannot pair a code with the wrong status.
 */
export function apiError(
	code: ErrorCode,
	message: string,
	options: ApiErrorOptions = {},
): ApiError {
	return {
		code,
		message,
		statusCode: options.statusCode ?? httpStatusForErrorCode(code),
		...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
		...(options.details === undefined ? {} : { details: options.details }),
	};
}

/**
 * Discriminated result envelope returned across every service boundary.
 * Kept intentionally minimal: success carries data, failure carries an
 * {@link ApiError}.
 */
export type ApiResponse<T> =
	| { readonly success: true; readonly data: T }
	| { readonly success: false; readonly error: ApiError };

/** Wrap a value as a successful {@link ApiResponse}. */
export function ok<T>(data: T): ApiResponse<T> {
	return { success: true, data };
}

/** Wrap an {@link ApiError} as a failed {@link ApiResponse}. */
export function err<T = never>(error: ApiError): ApiResponse<T> {
	return { success: false, error };
}
