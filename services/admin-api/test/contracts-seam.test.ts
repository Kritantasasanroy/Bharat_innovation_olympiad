import { describe, expect, it } from "bun:test";
import { EXPECTED_CONTRACT_VERSION as FROM_PACKAGE } from "@bio/admin-contract-fixtures";
import { type ApiResponse, EXPECTED_CONTRACT_VERSION } from "../src/contracts";

/**
 * The contract seam (`src/contracts/index.ts`) is the single local path for
 * cross-repo contracts. These tests pin the value re-export and exercise the
 * envelope types so the seam keeps compiling and stays the one checkpoint.
 */
describe("contracts seam", () => {
	it("re-exports the CONTRACT_VERSION gate from the contract package", () => {
		expect(EXPECTED_CONTRACT_VERSION).toBe(FROM_PACKAGE);
	});

	it("re-exports the API response envelope types (success branch)", () => {
		const ok: ApiResponse<{ id: string }> = { success: true, data: { id: "q1" } };
		expect(ok.success).toBe(true);
		if (ok.success) {
			expect(ok.data.id).toBe("q1");
		}
	});

	it("re-exports the API response envelope types (error branch)", () => {
		const err: ApiResponse<never> = {
			success: false,
			error: { code: "NOT_FOUND", message: "missing", statusCode: 404 },
		};
		expect(err.success).toBe(false);
		if (!err.success) {
			expect(err.error.statusCode).toBe(404);
		}
	});
});
