import { describe, expect, it } from "bun:test";
import { EXPECTED_CONTRACT_VERSION } from "./contract-version";

describe("contract version gate", () => {
	it("declares the expected BIO contract version", () => {
		expect(EXPECTED_CONTRACT_VERSION).toBe("0.1.0");
	});
});
