import { closeRedis } from "./adapters/out/cache/redis.client";
import { closePostgres } from "./adapters/out/persistence/postgres.client";
import { app } from "./app";
import { logger, registerCloseable, registerShutdownHooks } from "./infra";

const PORT = Number(process.env["PORT"] ?? 3000);

registerCloseable("Redis", closeRedis);
registerCloseable("PostgreSQL", closePostgres);
registerShutdownHooks(logger);

app.listen(PORT);
logger.info({ port: PORT }, "API running");
