import { HttpAdminApiClient } from "./adapters/out/http/admin-api.client";
import { InMemorySupportRequestRepository } from "./adapters/out/persistence/in-memory-support-request.repository";
import { buildApp } from "./app";
import { logger } from "./infra";
import { config } from "./infra/config";

export const app = buildApp({
	adminApiClient: new HttpAdminApiClient(
		config.adminApiUrl,
		config.studentAppUrl,
		fetch,
		config.schoolAppUrl,
	),
	supportRequestRepository: new InMemorySupportRequestRepository(),
	jwtSecret: config.jwtSecret,
});

if (import.meta.main) {
	app.listen(config.port);
	logger.info({ port: config.port, adminApiUrl: config.adminApiUrl }, "portal-api running");
}
