import type { TimerStore } from "../../../core/ports/out";
import { getRedis } from "./redis.client";

const key = (attemptId: string): string => `exam:timer:${attemptId}`;

/**
 * Redis-backed {@link TimerStore}. Stores each attempt's absolute deadline
 * (epoch ms) so the server-authoritative timer survives process restarts; the
 * TTL bounds stale keys and the service recomputes from Postgres on a miss.
 */
export class RedisTimerStore implements TimerStore {
	private readonly redis = getRedis();

	async setDeadline(attemptId: string, deadlineMs: number, ttlSecs: number): Promise<void> {
		await this.redis.set(key(attemptId), String(deadlineMs), "EX", ttlSecs);
	}

	async getDeadline(attemptId: string): Promise<number | null> {
		const value = await this.redis.get(key(attemptId));
		return value === null ? null : Number(value);
	}

	async clear(attemptId: string): Promise<void> {
		await this.redis.del(key(attemptId));
	}
}
