/**
 * Cross-repo contract seam for `bio-admin`.
 *
 * This is the **single import path** for every cross-repo contract shape
 * consumed inside `services/admin-api`: the API/event **envelope**, the
 * canonical **event** catalog, and the domain **entity** types. Feature
 * code imports from here (`@contracts`) and never from the underlying
 * `@bio/*` contract packages directly, so:
 *
 *  - there is exactly **one checkpoint** for the boundary gate to police
 *    (see `.eslintrc.json` — `no-restricted-imports` blocks the raw
 *    packages outside this file); and
 *  - swapping a workspace bridge package for the published private
 *    package (PLAT-02 §6, §10) is a one-file change.
 *
 * **No handwritten duplicate DTOs.** Cross-service shapes are owned by the
 * shared contract packages (PLAT-02 FR-1/FR-2). Nothing in this service may
 * redeclare an envelope, event, or entity type that belongs to a contract
 * package; it must be re-exported through this seam instead.
 *
 * ```ts
 * // feature code — one local path, no @bio/* imports
 * import type { ApiResponse } from "@contracts";
 * import { EXPECTED_CONTRACT_VERSION } from "@contracts";
 * ```
 */

// ---------------------------------------------------------------------------
// Contract version — the single `CONTRACT_VERSION` gate (PLAT-02 FR-8).
// A service built against one contract refuses to start against a skewed
// `CONTRACT_VERSION` (see `src/config/admin-config.ts`).
// ---------------------------------------------------------------------------
export { EXPECTED_CONTRACT_VERSION } from "@bio/admin-contract-fixtures";

// ---------------------------------------------------------------------------
// Envelope — API response envelope + error codes (PLAT-02 FR-1).
// Source: `@bio/admin-shared-types` (the workspace `shared-types` bridge).
// ---------------------------------------------------------------------------
export type {
	ApiError,
	ApiErrorResponse,
	ApiFieldError,
	ApiResponse,
	ApiResult,
	ApiSuccessResponse,
} from "@bio/admin-shared-types";

// ---------------------------------------------------------------------------
// Events + entities — domain contracts (PLAT-02 FR-2/FR-6/FR-7).
//
// The canonical cross-repo **event envelope** (eventId, eventType,
// eventVersion, occurredAt, producer, correlationId, causationId,
// idempotencyKey, payload), the named **events** of §7, and the **entity**
// types (`ExamSnapshot` key-stripped, `SlotCatalog`, `Entitlement`, and the
// branded value-object IDs) are owned by `@bio/domain-contracts`.
//
// That package is published from the `bio-contracts` repo and is not yet a
// dependency of this workspace (AGENTS.md: "use `bio-contracts` ... when
// available"). When it lands, wire it up **here and only here** so this seam
// stays the one checkpoint, e.g.:
//
//   export type {
//     EventEnvelope,
//     ExamSnapshot,
//     SlotCatalog,
//     Entitlement,
//     // ...branded IDs and named events
//   } from "@bio/domain-contracts";
//
// Do not re-create these shapes locally — that would be a duplicate DTO and
// is rejected by the boundary gate and PLAT-02 §11 (0 duplicated DTOs).
// ---------------------------------------------------------------------------
