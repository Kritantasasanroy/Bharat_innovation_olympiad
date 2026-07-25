/**
 * `@bio/shared-types` — the cross-service shared kernel (PLAT-02 FR-1).
 *
 * API envelope + canonical error codes, cursor pagination, the standard
 * log/trace envelope (consumed by PLAT-04), SemVer/contract-version helpers,
 * and the security field-classification tagging helper. Zero runtime deps
 * beyond Zod; tree-shakeable.
 */

/** The single canonical contract version checked across every repo (FR-8). */
export const CONTRACT_VERSION = "0.1.0" as const;

export * from "./api.ts";
export * from "./classification.ts";
export * from "./error-codes.ts";
export * from "./observability.ts";
export * from "./pagination.ts";
export * from "./semver.ts";
