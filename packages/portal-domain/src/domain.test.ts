import { describe, expect, it } from "bun:test";
import { PORTAL_PRIMARY_FLOWS } from "./index";

describe("portal domain", () => {
	it("tracks entitlement flow", () => {
		expect(PORTAL_PRIMARY_FLOWS).toContain("entitlement");
	});
});
