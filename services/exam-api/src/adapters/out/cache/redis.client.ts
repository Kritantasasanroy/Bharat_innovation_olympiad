import { Redis } from "ioredis";

let client: Redis | null = null;

/** Lazily-initialized shared Redis connection. */
export function getRedis(): Redis {
	if (!client) {
		client = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
			maxRetriesPerRequest: null,
		});
	}
	return client;
}

export async function closeRedis(): Promise<void> {
	if (client) {
		await client.quit();
		client = null;
	}
}
