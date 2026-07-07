import { describe, expect, it } from "bun:test";
import { CONTRACT_VERSION } from "../../shared-types/src/index.ts";
import { registrationConfirmedFixture } from "./index.ts";

describe("BIO contract fixtures", () => {
	it("uses the canonical contract version", () => {
		expect(registrationConfirmedFixture.eventVersion).toBe(CONTRACT_VERSION);
	});
});
