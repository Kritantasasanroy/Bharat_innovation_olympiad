import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	type ApiResponse,
	apiError,
	CONTRACT_VERSION,
	classificationOf,
	classify,
	compareSemVer,
	DEFAULT_PAGE_SIZE,
	ERROR_CODES,
	err,
	FieldClassification,
	formatSemVer,
	formatTraceparent,
	httpStatusForErrorCode,
	isCompatibleMajor,
	isErrorCode,
	isFieldClassification,
	LOG_LEVELS,
	MAX_PAGE_SIZE,
	ok,
	type Page,
	page,
	parseContractVersion,
	parseSemVer,
	parseTraceparent,
	resolvePageLimit,
} from "./index.ts";

describe("contract version", () => {
	it("is valid SemVer and re-parses to itself", () => {
		const parsed = parseContractVersion(CONTRACT_VERSION);
		expect(formatSemVer(parsed)).toBe(CONTRACT_VERSION);
		expect(parsed.major).toBe(0);
		expect(parsed.minor).toBe(1);
	});
});

describe("error codes", () => {
	it("maps every canonical code to its default HTTP status", () => {
		expect(httpStatusForErrorCode("NOT_FOUND")).toBe(404);
		expect(httpStatusForErrorCode("RATE_LIMITED")).toBe(429);
		expect(httpStatusForErrorCode("UNSUPPORTED_CONTRACT_VERSION")).toBe(422);
	});

	it("recognises known codes and rejects unknown ones", () => {
		expect(isErrorCode("INTERNAL_ERROR")).toBe(true);
		expect(isErrorCode("NOPE")).toBe(false);
		expect(isErrorCode(42)).toBe(false);
	});

	it("keeps statuses in the valid HTTP range", () => {
		for (const status of Object.values(ERROR_CODES)) {
			expect(status).toBeGreaterThanOrEqual(400);
			expect(status).toBeLessThan(600);
		}
	});
});

describe("apiError", () => {
	it("defaults statusCode from the canonical table", () => {
		const e = apiError("NOT_FOUND", "missing");
		expect(e.statusCode).toBe(404);
		expect(e.correlationId).toBeUndefined();
		expect("details" in e).toBe(false);
	});

	it("honours overrides and carries a correlationId", () => {
		const e = apiError("CONFLICT", "dup", {
			statusCode: 410,
			correlationId: "corr-1",
			details: { field: "seat" },
		});
		expect(e.statusCode).toBe(410);
		expect(e.correlationId).toBe("corr-1");
		expect(e.details).toEqual({ field: "seat" });
	});
});

describe("ApiResponse helpers", () => {
	it("discriminates success and failure", () => {
		const good: ApiResponse<number> = ok(7);
		const bad = err<number>(apiError("INTERNAL_ERROR", "boom"));
		expect(good.success).toBe(true);
		if (good.success) {
			expect(good.data).toBe(7);
		}
		expect(bad.success).toBe(false);
		if (!bad.success) {
			expect(bad.error.code).toBe("INTERNAL_ERROR");
		}
	});
});

describe("pagination", () => {
	it("exposes sane page-size bounds", () => {
		expect(DEFAULT_PAGE_SIZE).toBe(20);
		expect(MAX_PAGE_SIZE).toBe(100);
	});

	it("clamps requested limits into range", () => {
		expect(resolvePageLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
		expect(resolvePageLimit(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
		expect(resolvePageLimit(0)).toBe(1);
		expect(resolvePageLimit(-5)).toBe(1);
		expect(resolvePageLimit(10_000)).toBe(MAX_PAGE_SIZE);
		expect(resolvePageLimit(33.9)).toBe(33);
	});

	it("builds a page and infers hasMore from the cursor", () => {
		const more: Page<number> = page([1, 2], "cursor-2");
		expect(more.hasMore).toBe(true);
		expect(more.nextCursor).toBe("cursor-2");

		const last = page([3], null);
		expect(last.hasMore).toBe(false);
		expect(last.nextCursor).toBeNull();
	});
});

describe("observability / traceparent", () => {
	it("exposes ordered log levels", () => {
		expect(LOG_LEVELS[0]).toBe("trace");
		expect(LOG_LEVELS.at(-1)).toBe("fatal");
	});

	it("round-trips a valid W3C traceparent", () => {
		const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
		const tp = parseTraceparent(header);
		expect(tp).not.toBeNull();
		if (tp !== null) {
			expect(tp.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
			expect(tp.parentId).toBe("00f067aa0ba902b7");
			expect(formatTraceparent(tp)).toBe(header);
		}
	});

	it("normalises case and surrounding whitespace", () => {
		const tp = parseTraceparent("  00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01  ");
		expect(tp?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
	});

	it("rejects malformed, reserved, and all-zero traceparents", () => {
		expect(parseTraceparent("not-a-header")).toBeNull();
		expect(parseTraceparent("00-tooShort-00f067aa0ba902b7-01")).toBeNull();
		// all-zero trace id is invalid per spec
		expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
		// reserved version ff
		expect(parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
	});
});

describe("semver", () => {
	it("parses core, prerelease, and build metadata", () => {
		const v = parseSemVer("1.2.3-rc.1+build.9");
		expect(v).toEqual({
			major: 1,
			minor: 2,
			patch: 3,
			prerelease: ["rc", "1"],
			build: ["build", "9"],
		});
	});

	it("returns null for invalid versions", () => {
		expect(parseSemVer("1.2")).toBeNull();
		expect(parseSemVer("v1.2.3")).toBeNull();
		expect(parseSemVer("01.2.3")).toBeNull();
		expect(parseSemVer("1.2.3.4")).toBeNull();
	});

	it("throws from parseContractVersion on invalid input", () => {
		expect(() => parseContractVersion("nope")).toThrow(TypeError);
	});

	it("orders by precedence with prerelease lower than release", () => {
		const a = parseContractVersion("1.0.0");
		const b = parseContractVersion("2.0.0");
		expect(compareSemVer(a, b)).toBe(-1);
		expect(compareSemVer(b, a)).toBe(1);
		expect(compareSemVer(a, a)).toBe(0);

		const rc = parseContractVersion("1.0.0-rc.1");
		const release = parseContractVersion("1.0.0");
		expect(compareSemVer(rc, release)).toBe(-1);

		const rc1 = parseContractVersion("1.0.0-alpha.1");
		const rc2 = parseContractVersion("1.0.0-alpha.2");
		expect(compareSemVer(rc1, rc2)).toBe(-1);
	});

	it("treats 0.x minors as breaking but stable majors as compatible", () => {
		expect(isCompatibleMajor(parseContractVersion("0.1.0"), parseContractVersion("0.1.5"))).toBe(
			true,
		);
		expect(isCompatibleMajor(parseContractVersion("0.1.0"), parseContractVersion("0.2.0"))).toBe(
			false,
		);
		expect(isCompatibleMajor(parseContractVersion("1.2.0"), parseContractVersion("1.9.9"))).toBe(
			true,
		);
		expect(isCompatibleMajor(parseContractVersion("1.0.0"), parseContractVersion("2.0.0"))).toBe(
			false,
		);
	});
});

describe("field classification", () => {
	it("recognises members and rejects non-members", () => {
		expect(isFieldClassification("public")).toBe(true);
		expect(isFieldClassification(FieldClassification.PaymentSensitive)).toBe(true);
		expect(isFieldClassification("top-secret")).toBe(false);
		expect(isFieldClassification(undefined)).toBe(false);
	});

	it("tags a Zod schema and reads the classification back", () => {
		const Email = classify(z.string().email(), FieldClassification.AuthenticatedStudent);
		expect(classificationOf(Email)).toBe(FieldClassification.AuthenticatedStudent);
		// classification survives JSON Schema generation (OpenAPI-compatible)
		const json = z.toJSONSchema(Email) as Record<string, unknown>;
		expect(json.bioFieldClassification).toBe("authenticated-student");
	});

	it("returns undefined for an unclassified schema", () => {
		expect(classificationOf(z.string())).toBeUndefined();
	});

	it("does not mutate the source schema (meta is immutable)", () => {
		const base = z.string();
		classify(base, FieldClassification.Public);
		expect(classificationOf(base)).toBeUndefined();
	});

	it("re-classifying overrides the previous tag", () => {
		const once = classify(z.number(), FieldClassification.Public);
		const twice = classify(once, FieldClassification.AdminOnly);
		expect(classificationOf(twice)).toBe(FieldClassification.AdminOnly);
	});
});
