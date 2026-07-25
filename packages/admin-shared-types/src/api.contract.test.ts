/**
 * Boundary gate: forbid drift between the local `@bio/admin-shared-types`
 * envelope and the canonical `@bio/shared-types` envelope (PRD-PLAT-02 FR-1).
 *
 * `packages/shared-types/src/api.ts` is an in-repo mirror of the API response
 * envelope owned by the `bio-contracts` package `@bio/shared-types`. Because
 * the canonical package is not yet a dependency of this workspace (Phase 0,
 * see `docs/contracts-bridge.md`), the canonical contract is reproduced here
 * as a frozen **golden** definition and the local types are asserted to be
 * structurally identical to it.
 *
 * The assertions are compile-time (`Expect<Equals<...>>`): they are evaluated
 * by `tsc --noEmit` (`pnpm typecheck`) and `bun test` (`pnpm test`), both of
 * which run under `pnpm verify` and CI. Any edit to `api.ts` that renames a
 * field, flips a discriminant, changes optionality, or otherwise diverges
 * from the canonical envelope fails this gate. The golden block below is the
 * single place to update — and only in lockstep with `@bio/shared-types`.
 */

import { describe, expect, it } from "bun:test";
import type {
	ApiError,
	ApiErrorResponse,
	ApiFieldError,
	ApiResponse,
	ApiResult,
	ApiSuccessResponse,
} from "./api.ts";

// ---------------------------------------------------------------------------
// Type-equality utilities.
//
// `Equals` is an exact (invariant) equality check: it is `true` only when `A`
// and `B` are mutually assignable *and* identical in optionality/readonly
// modifiers, so a widening or narrowing edit to the local envelope is caught.
// ---------------------------------------------------------------------------
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// GOLDEN — canonical `@bio/shared-types` API response envelope (PLAT-02 FR-1).
// Keep this block byte-for-byte in step with the canonical package. Do not
// edit it to match a local change; edit it only to track an intentional
// canonical contract change, then update `api.ts` to match.
// ---------------------------------------------------------------------------
interface CanonicalApiFieldError {
	readonly field: string;
	readonly message: string;
}

interface CanonicalApiError {
	readonly code: string;
	readonly message: string;
	readonly statusCode: number;
	readonly details?: readonly CanonicalApiFieldError[];
}

interface CanonicalApiSuccessResponse<T> {
	readonly success: true;
	readonly data: T;
}

interface CanonicalApiErrorResponse {
	readonly success: false;
	readonly error: CanonicalApiError;
}

type CanonicalApiResponse<T> = CanonicalApiSuccessResponse<T> | CanonicalApiErrorResponse;

// A representative payload used to instantiate the generic envelopes so the
// equality checks compare concrete, fully-resolved shapes.
interface ProbePayload {
	readonly id: string;
	readonly value: number;
}

// ---------------------------------------------------------------------------
// Drift assertions — compile-time. A failure here is a `tsc` error, not a
// runtime expectation, so it blocks `pnpm typecheck` before tests even run.
// ---------------------------------------------------------------------------
type _AssertApiFieldError = Expect<Equals<ApiFieldError, CanonicalApiFieldError>>;
type _AssertApiError = Expect<Equals<ApiError, CanonicalApiError>>;
type _AssertApiSuccess = Expect<
	Equals<ApiSuccessResponse<ProbePayload>, CanonicalApiSuccessResponse<ProbePayload>>
>;
type _AssertApiErrorResponse = Expect<Equals<ApiErrorResponse, CanonicalApiErrorResponse>>;
type _AssertApiResponse = Expect<
	Equals<ApiResponse<ProbePayload>, CanonicalApiResponse<ProbePayload>>
>;
// `ApiResult` must remain a pure alias of `ApiResponse`.
type _AssertApiResultAlias = Expect<Equals<ApiResult<ProbePayload>, ApiResponse<ProbePayload>>>;

// Reference the assertion aliases so `verbatimModuleSyntax`/no-unused tooling
// keeps them live and a regression cannot be silently stripped.
type _DriftGate = [
	_AssertApiFieldError,
	_AssertApiError,
	_AssertApiSuccess,
	_AssertApiErrorResponse,
	_AssertApiResponse,
	_AssertApiResultAlias,
];

describe("@bio/admin-shared-types ↔ @bio/shared-types envelope drift gate", () => {
	it("keeps the envelope shape aligned with the canonical golden (compile-time)", () => {
		// If `api.ts` drifts from the golden, the `Expect<Equals<...>>` aliases
		// above fail to compile and this file never runs. Reaching this point
		// means the shapes are identical.
		const gateHeld: _DriftGate extends never ? never : true = true;
		expect(gateHeld).toBe(true);
	});

	it("narrows on the `success` discriminant for a success response", () => {
		const ok: ApiResponse<ProbePayload> = {
			success: true,
			data: { id: "abc", value: 1 },
		};

		if (ok.success) {
			expect(ok.data).toEqual({ id: "abc", value: 1 });
		} else {
			throw new Error("expected success branch");
		}
	});

	it("narrows on the `success` discriminant for an error response", () => {
		const fail: ApiResponse<ProbePayload> = {
			success: false,
			error: {
				code: "VALIDATION_ERROR",
				message: "Validation failed",
				statusCode: 400,
				details: [{ field: "body.title", message: "Required" }],
			},
		};

		if (fail.success) {
			throw new Error("expected error branch");
		}

		expect(fail.error.code).toBe("VALIDATION_ERROR");
		expect(fail.error.statusCode).toBe(400);
		expect(fail.error.details?.[0]).toEqual({ field: "body.title", message: "Required" });
	});
});
