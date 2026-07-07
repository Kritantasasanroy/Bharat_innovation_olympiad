/**
 * Fail-closed configuration for the bio-admin API.
 *
 * The service must refuse to boot when required secrets or connection
 * strings are missing, empty, or malformed. There are **no dev-secret
 * fallbacks** here: a missing `DATABASE_URL` is an error, never a silent
 * default (PLAT-03 FR-3, secrets & config, fail-closed).
 *
 * The contract version is validated against the single
 * {@link EXPECTED_CONTRACT_VERSION} constant shared across BIO repos
 * (PLAT-02), so a service built against one contract refuses to start
 * when deployed with a mismatched `CONTRACT_VERSION` env value.
 */

import { EXPECTED_CONTRACT_VERSION } from "@bio/admin-contract-fixtures";
import { z } from "zod";

/** Pino log levels accepted for `LOG_LEVEL`. */
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/**
 * Schema for the admin API runtime configuration.
 *
 * Required secrets (`DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`,
 * `CONTRACT_VERSION`) have no defaults; an absent or empty value fails
 * validation. `PORT` and `LOG_LEVEL` are operational knobs with safe
 * defaults.
 */
const adminConfigSchema = z.object({
	DATABASE_URL: z
		.string({ message: "DATABASE_URL is required" })
		.min(1, "DATABASE_URL must not be empty"),
	REDIS_URL: z.string({ message: "REDIS_URL is required" }).min(1, "REDIS_URL must not be empty"),
	CORS_ORIGIN: z
		.string({ message: "CORS_ORIGIN is required" })
		.min(1, "CORS_ORIGIN must not be empty"),
	PORT: z.coerce
		.number({ message: "PORT must be a number" })
		.int("PORT must be an integer")
		.min(1, "PORT must be between 1 and 65535")
		.max(65535, "PORT must be between 1 and 65535")
		.default(3000),
	LOG_LEVEL: z
		.enum(LOG_LEVELS, {
			message: `LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}`,
		})
		.default("info"),
	CONTRACT_VERSION: z
		.string({ message: "CONTRACT_VERSION is required" })
		.min(1, "CONTRACT_VERSION must not be empty")
		.refine((value) => value === EXPECTED_CONTRACT_VERSION, {
			message: `CONTRACT_VERSION must be "${EXPECTED_CONTRACT_VERSION}" (contract version skew, see PLAT-02)`,
		}),
});

/** Validated, fully-typed admin API configuration. */
export interface AdminConfig {
	readonly databaseUrl: string;
	readonly redisUrl: string;
	readonly corsOrigin: string;
	readonly port: number;
	readonly logLevel: (typeof LOG_LEVELS)[number];
	readonly contractVersion: string;
}

/**
 * Thrown when configuration validation fails at boot.
 *
 * The message lists every offending variable so an operator can fix the
 * deployment in one pass rather than discovering missing vars one at a
 * time.
 */
export class MissingConfigError extends Error {
	/** Machine-readable code for log filtering and alerting. */
	readonly code = "MISSING_CONFIG";
	/** Per-variable validation problems (`VAR: reason`). */
	readonly problems: readonly string[];

	constructor(problems: readonly string[]) {
		super(
			`Configuration validation failed; the service will not start:\n  - ${problems.join(
				"\n  - ",
			)}`,
		);
		this.name = "MissingConfigError";
		this.problems = problems;
		Object.setPrototypeOf(this, MissingConfigError.prototype);
	}
}

/**
 * Parse and validate configuration from an environment-like source.
 *
 * @param env - Source of raw values; defaults to `process.env`.
 * @returns The validated, typed {@link AdminConfig}.
 * @throws {MissingConfigError} when any required value is absent, empty,
 *   or fails validation (fail-closed: no defaults for secrets).
 */
export function loadAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
	const result = adminConfigSchema.safeParse({
		DATABASE_URL: env["DATABASE_URL"],
		REDIS_URL: env["REDIS_URL"],
		CORS_ORIGIN: env["CORS_ORIGIN"],
		PORT: env["PORT"],
		LOG_LEVEL: env["LOG_LEVEL"],
		CONTRACT_VERSION: env["CONTRACT_VERSION"],
	});

	if (!result.success) {
		const problems = result.error.issues.map((issue) => {
			const field = issue.path.join(".") || "(root)";
			return `${field}: ${issue.message}`;
		});
		throw new MissingConfigError(problems);
	}

	const parsed = result.data;
	return {
		databaseUrl: parsed.DATABASE_URL,
		redisUrl: parsed.REDIS_URL,
		corsOrigin: parsed.CORS_ORIGIN,
		port: parsed.PORT,
		logLevel: parsed.LOG_LEVEL,
		contractVersion: parsed.CONTRACT_VERSION,
	};
}
