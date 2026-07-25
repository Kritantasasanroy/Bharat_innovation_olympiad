import type { Logger } from "pino";
import { logger as defaultLogger } from "./logger";

type CloseFunction = () => Promise<void>;

interface Closeable {
	name: string;
	close: CloseFunction;
}

/**
 * Registry of closeable resources, ordered by shutdown priority.
 * Resources are closed via Promise.allSettled so a single failure
 * does not prevent other resources from shutting down.
 */
const closeables: Closeable[] = [];

let shutdownInProgress = false;

/**
 * Register a closeable resource for graceful shutdown.
 * Resources are closed in registration order — register in the desired
 * shutdown sequence (e.g. Redis first, then MongoDB, then PostgreSQL).
 */
export function registerCloseable(name: string, close: CloseFunction): void {
	closeables.push({ name, close });
}

/**
 * Clears all registered closeables. Intended for test cleanup only.
 */
export function clearCloseables(): void {
	closeables.length = 0;
	shutdownInProgress = false;
}

/**
 * Executes graceful shutdown: closes all registered resources via
 * Promise.allSettled and logs the outcome of each.
 */
export async function gracefulShutdown(signal: string, log: Logger = defaultLogger): Promise<void> {
	if (shutdownInProgress) {
		log.warn("Shutdown already in progress, ignoring duplicate signal");
		return;
	}
	shutdownInProgress = true;

	log.info({ signal }, "Shutdown signal received — closing connections");

	if (closeables.length === 0) {
		log.info("No connections to close");
		return;
	}

	const results = await Promise.allSettled(
		closeables.map(async (c) => {
			log.info({ resource: c.name }, "Closing resource");
			await c.close();
			log.info({ resource: c.name }, "Resource closed");
		}),
	);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		const closeable = closeables[i];
		if (result && closeable && result.status === "rejected") {
			log.error({ resource: closeable.name, err: result.reason }, "Failed to close resource");
		}
	}

	log.info("All connections closed — shutting down");
}

/**
 * Registers process signal handlers (SIGTERM, SIGINT) for graceful shutdown.
 * Call once during application startup after all closeables have been registered.
 */
export function registerShutdownHooks(log: Logger = defaultLogger): void {
	const handler = async (signal: string) => {
		await gracefulShutdown(signal, log);
		process.exit(0);
	};

	process.on("SIGTERM", () => handler("SIGTERM"));
	process.on("SIGINT", () => handler("SIGINT"));

	log.info("Shutdown hooks registered (SIGTERM, SIGINT)");
}
