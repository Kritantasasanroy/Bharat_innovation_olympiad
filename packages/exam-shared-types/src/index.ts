/**
 * @bio/exam-shared-types — barrel export.
 *
 * Re-exports all shared type definitions used across the monorepo.
 * Consumers can import from the root or from sub-paths:
 *
 * ```ts
 * import type { ApiResponse } from "@bio/exam-shared-types";
 * // or
 * import type { ApiResponse } from "@bio/exam-shared-types/api";
 * ```
 */

export type {
	ApiError,
	ApiErrorResponse,
	ApiFieldError,
	ApiResponse,
	ApiResult,
	ApiSuccessResponse,
} from "./api.ts";
