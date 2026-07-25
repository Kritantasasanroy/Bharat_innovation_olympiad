/**
 * Shared API response types.
 *
 * These types define the standard envelope used by all API endpoints,
 * ensuring consistent response shapes across the backend and frontend.
 */

/** Standard error detail returned in API error responses. */
export interface ApiError {
	/** Machine-readable error code (e.g. "VALIDATION_ERROR", "NOT_FOUND"). */
	readonly code: string;
	/** Human-readable error message. */
	readonly message: string;
	/** HTTP status code. */
	readonly statusCode: number;
	/** Optional field-level validation details. */
	readonly details?: readonly ApiFieldError[];
}

/** A single field-level validation error. */
export interface ApiFieldError {
	/** The field path that failed validation (e.g. "body.title"). */
	readonly field: string;
	/** Description of the validation failure. */
	readonly message: string;
}

/** Successful API response wrapping a data payload. */
export interface ApiSuccessResponse<T> {
	readonly success: true;
	readonly data: T;
}

/** Failed API response wrapping an error. */
export interface ApiErrorResponse {
	readonly success: false;
	readonly error: ApiError;
}

/**
 * Discriminated union of success and error API responses.
 *
 * Consumers can narrow on the `success` field:
 * ```ts
 * if (result.success) {
 *   result.data; // T
 * } else {
 *   result.error; // ApiError
 * }
 * ```
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Alias for ApiResponse — used when callers want to emphasise
 * the result-or-error semantics (similar to Result<T, E>).
 */
export type ApiResult<T> = ApiResponse<T>;
