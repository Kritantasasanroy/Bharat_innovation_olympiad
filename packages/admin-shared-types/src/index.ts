/**
 * @bio/admin-shared-types — barrel export.
 *
 * Re-exports all shared type definitions used across the monorepo.
 * Consumers can import from the root or from sub-paths:
 *
 * ```ts
 * import type { ApiResponse } from "@bio/admin-shared-types";
 * // or
 * import type { ApiResponse } from "@bio/admin-shared-types/api";
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

/**
 * The semantic version of the Innovation Olympiad cross-repo contract that the *shapes* in
 * this package implement. This is the producer-side source of truth: bump it
 * (per semver) whenever the exported types change. Consumers pin the version
 * they were built against in `@bio/admin-contract-fixtures`
 * (`EXPECTED_CONTRACT_VERSION`) and fail closed at boot on a major mismatch
 * (PLAT-02 contract-version gate).
 */
export const CONTRACT_VERSION = "0.1.0";
