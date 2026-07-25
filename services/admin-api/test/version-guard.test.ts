import { describe, expect, it } from "bun:test";
import { EXPECTED_CONTRACT_VERSION } from "@bio/admin-contract-fixtures";
import { CONTRACT_VERSION } from "@bio/admin-shared-types";
import {
	assertContractCompatible,
	ContractVersionMismatchError,
} from "../src/contracts/version-guard";

describe("assertContractCompatible (fail-closed)", () => {
	it("passes for the live, in-repo expected/actual contract versions", () => {
		expect(() => assertContractCompatible()).not.toThrow();
	});

	it("passes when expected and actual are explicitly equal", () => {
		expect(() => assertContractCompatible({ expected: "1.4.2", actual: "1.4.2" })).not.toThrow();
	});

	it("passes for minor/patch drift once stable (>= 1.0.0)", () => {
		expect(() => assertContractCompatible({ expected: "1.0.0", actual: "1.9.9" })).not.toThrow();
	});

	it("throws ContractVersionMismatchError on a major divergence", () => {
		expect(() => assertContractCompatible({ expected: "1.0.0", actual: "2.0.0" })).toThrow(
			ContractVersionMismatchError,
		);
	});

	it("treats a 0.x minor bump as incompatible", () => {
		expect(() => assertContractCompatible({ expected: "0.1.0", actual: "0.2.0" })).toThrow(
			ContractVersionMismatchError,
		);
	});

	it("carries the expected and actual versions on the error", () => {
		try {
			assertContractCompatible({ expected: "0.1.0", actual: "3.0.0" });
			throw new Error("expected assertContractCompatible to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(ContractVersionMismatchError);
			const mismatch = error as ContractVersionMismatchError;
			expect(mismatch.code).toBe("CONTRACT_VERSION_MISMATCH");
			expect(mismatch.expected).toBe("0.1.0");
			expect(mismatch.actual).toBe("3.0.0");
		}
	});

	it("keeps EXPECTED_CONTRACT_VERSION and shared-types CONTRACT_VERSION in sync", () => {
		expect(() =>
			assertContractCompatible({ expected: EXPECTED_CONTRACT_VERSION, actual: CONTRACT_VERSION }),
		).not.toThrow();
	});
});
