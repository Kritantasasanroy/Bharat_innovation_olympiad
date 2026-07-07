import { describe, expect, it } from "bun:test";
import { EXPECTED_CONTRACT_VERSION } from "@bio/admin-contract-fixtures";
import { loadAdminConfig, MissingConfigError } from "../src/config/admin-config";

/** A complete, valid environment used as the baseline for each case. */
function validEnv(): NodeJS.ProcessEnv {
	return {
		DATABASE_URL: "postgresql://admin:secret@localhost:5433/admin",
		REDIS_URL: "redis://:secret@localhost:6380",
		CORS_ORIGIN: "http://localhost:5173",
		PORT: "3000",
		LOG_LEVEL: "info",
		CONTRACT_VERSION: EXPECTED_CONTRACT_VERSION,
	};
}

describe("loadAdminConfig (fail-closed)", () => {
	it("parses a fully-populated environment", () => {
		const config = loadAdminConfig(validEnv());
		expect(config).toEqual({
			databaseUrl: "postgresql://admin:secret@localhost:5433/admin",
			redisUrl: "redis://:secret@localhost:6380",
			corsOrigin: "http://localhost:5173",
			port: 3000,
			logLevel: "info",
			contractVersion: EXPECTED_CONTRACT_VERSION,
		});
	});

	it("coerces PORT to a number and defaults PORT/LOG_LEVEL when absent", () => {
		const env = validEnv();
		delete env["PORT"];
		delete env["LOG_LEVEL"];
		const config = loadAdminConfig(env);
		expect(config.port).toBe(3000);
		expect(config.logLevel).toBe("info");
	});

	for (const secret of ["DATABASE_URL", "REDIS_URL", "CORS_ORIGIN", "CONTRACT_VERSION"]) {
		it(`throws MissingConfigError when ${secret} is absent`, () => {
			const env = validEnv();
			delete env[secret];
			expect(() => loadAdminConfig(env)).toThrow(MissingConfigError);
		});

		it(`throws MissingConfigError when ${secret} is empty`, () => {
			const env = validEnv();
			env[secret] = "";
			expect(() => loadAdminConfig(env)).toThrow(MissingConfigError);
		});
	}

	it("rejects a CONTRACT_VERSION that does not match the expected version", () => {
		const env = validEnv();
		env["CONTRACT_VERSION"] = "9.9.9";
		expect(() => loadAdminConfig(env)).toThrow(MissingConfigError);
	});

	it("rejects an invalid PORT", () => {
		const env = validEnv();
		env["PORT"] = "not-a-port";
		expect(() => loadAdminConfig(env)).toThrow(MissingConfigError);
	});

	it("rejects an unknown LOG_LEVEL", () => {
		const env = validEnv();
		env["LOG_LEVEL"] = "verbose";
		expect(() => loadAdminConfig(env)).toThrow(MissingConfigError);
	});

	it("reports every missing secret in one error", () => {
		const env = validEnv();
		delete env["DATABASE_URL"];
		delete env["REDIS_URL"];
		try {
			loadAdminConfig(env);
			throw new Error("expected loadAdminConfig to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(MissingConfigError);
			const { problems } = error as MissingConfigError;
			expect(problems.some((p) => p.startsWith("DATABASE_URL"))).toBe(true);
			expect(problems.some((p) => p.startsWith("REDIS_URL"))).toBe(true);
		}
	});
});
