import { closeRedis } from "./adapters/out/cache/redis.client";
import { closePostgres } from "./adapters/out/persistence/postgres.client";
import { app } from "./app";
import { loadAdminConfig, MissingConfigError } from "./config/admin-config";
import { assertContractCompatible, ContractVersionMismatchError } from "./contracts/version-guard";
import { logger, registerCloseable, registerShutdownHooks } from "./infra";

// Fail closed: the linked @bio/admin-shared-types contract must be compatible
// with the version this service was built against. A major skew means the wire
// shapes may have changed incompatibly, so refuse to boot rather than serve
// data we might misinterpret (PLAT-02 contract-version gate).
try {
	assertContractCompatible();
} catch (error) {
	if (error instanceof ContractVersionMismatchError) {
		logger.fatal(
			{ code: error.code, expected: error.expected, actual: error.actual },
			error.message,
		);
	} else {
		logger.fatal({ err: error }, "Unexpected error while checking the contract version");
	}
	process.exit(1);
}

// Fail closed: validate configuration before binding the port. A missing or
// malformed secret must stop the service from booting, never fall back to a
// default (PLAT-03 FR-3). loadAdminConfig throws MissingConfigError on any
// absent required value.
let config: ReturnType<typeof loadAdminConfig>;
try {
	config = loadAdminConfig();
} catch (error) {
	if (error instanceof MissingConfigError) {
		logger.fatal({ code: error.code, problems: error.problems }, error.message);
	} else {
		logger.fatal({ err: error }, "Unexpected error while loading configuration");
	}
	process.exit(1);
}

registerCloseable("Redis", closeRedis);
registerCloseable("PostgreSQL", closePostgres);
registerShutdownHooks(logger);

app.listen(config.port);
logger.info({ port: config.port, contractVersion: config.contractVersion }, "API running");
