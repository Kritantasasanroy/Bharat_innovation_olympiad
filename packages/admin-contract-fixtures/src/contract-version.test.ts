import { describe, expect, it } from "bun:test";
import { CONTRACT_VERSION } from "@bio/admin-shared-types";
import {
	EXPECTED_CONTRACT_VERSION,
	isContractCompatible,
	parseContractVersion,
} from "./contract-version";

describe("contract version gate", () => {
	it("declares the expected BIO contract version", () => {
		expect(EXPECTED_CONTRACT_VERSION).toBe("0.1.0");
	});

	// Drift assertion: the version this repo is built against must stay
	// compatible with the contract the linked @bio/admin-shared-types actually
	// advertises. A breaking bump on either side without the other fails here,
	// in CI, before it can fail closed at the consumer's boot (PLAT-02).
	it("stays compatible with the linked shared-types CONTRACT_VERSION", () => {
		expect(isContractCompatible(EXPECTED_CONTRACT_VERSION, CONTRACT_VERSION)).toBe(true);
	});

	it("currently matches the shared-types contract version exactly", () => {
		expect(CONTRACT_VERSION).toBe(EXPECTED_CONTRACT_VERSION);
	});
});

describe("isContractCompatible", () => {
	it("accepts identical versions", () => {
		expect(isContractCompatible("1.2.3", "1.2.3")).toBe(true);
	});

	it("rejects a different major version", () => {
		expect(isContractCompatible("1.0.0", "2.0.0")).toBe(false);
	});

	it("accepts minor/patch drift once stable (>= 1.0.0)", () => {
		expect(isContractCompatible("1.0.0", "1.7.4")).toBe(true);
	});

	it("treats 0.x minor bumps as breaking per semver", () => {
		expect(isContractCompatible("0.1.0", "0.2.0")).toBe(false);
		expect(isContractCompatible("0.1.0", "0.1.9")).toBe(true);
	});

	it("throws on a malformed version", () => {
		expect(() => isContractCompatible("1.0", "1.0.0")).toThrow();
	});
});

describe("parseContractVersion", () => {
	it("splits a semantic version into numeric parts", () => {
		expect(parseContractVersion("3.14.159")).toEqual({ major: 3, minor: 14, patch: 159 });
	});

	it("ignores pre-release and build metadata", () => {
		expect(parseContractVersion("1.2.3-rc.1+build.5")).toEqual({ major: 1, minor: 2, patch: 3 });
	});

	it("rejects a non-semver string", () => {
		expect(() => parseContractVersion("v1")).toThrow(RangeError);
	});
});
