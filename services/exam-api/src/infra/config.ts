/** Environment-derived runtime configuration. Read once at process start. */
export interface Config {
	readonly port: number;
	readonly databaseUrl: string;
	readonly redisUrl: string;
	readonly jwtSecret: string;
	readonly demoExamIds: readonly string[];
}

export function loadConfig(): Config {
	return {
		port: Number(process.env["PORT"] ?? 3000),
		databaseUrl: process.env["DATABASE_URL"] ?? "",
		redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
		jwtSecret: process.env["JWT_SECRET"] ?? "",
		demoExamIds: (process.env["DEMO_EXAM_IDS"] ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	};
}

export const config: Config = loadConfig();
