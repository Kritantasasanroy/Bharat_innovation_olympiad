import type { Level, Logger } from "pino";
import pino from "pino";

const LOG_LEVELS: ReadonlySet<string> = new Set<string>([
	"fatal",
	"error",
	"warn",
	"info",
	"debug",
	"trace",
	"silent",
]);

function resolveLogLevel(): Level {
	const envLevel = process.env["LOG_LEVEL"]?.toLowerCase();
	if (envLevel && LOG_LEVELS.has(envLevel)) {
		return envLevel as Level;
	}
	return "info";
}

function isProduction(): boolean {
	return process.env.NODE_ENV === "production";
}

function buildLogger(): Logger {
	const level = resolveLogLevel();

	if (isProduction()) {
		return pino({ level });
	}

	return pino({
		level,
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:HH:MM:ss.l",
				ignore: "pid,hostname",
			},
		},
	});
}

/** Root application logger — JSON in production, pretty-printed in development. */
export const logger: Logger = buildLogger();

/** Create a child logger with a bound component name. */
export function createLogger(component: string): Logger {
	return logger.child({ component });
}

export type { Logger };
