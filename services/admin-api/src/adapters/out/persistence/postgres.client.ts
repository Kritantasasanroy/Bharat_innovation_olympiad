import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/schema";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazily-initialized Drizzle client bound to the shared Postgres database
 * (PRD-046's `Partner`/`PartnerApplication`/`Campaign`/... tables — see
 * `./schema/schema.ts`). Mirrors `services/exam-api`'s client of the same
 * name: the pool is only opened on first use, so importing this module (or
 * anything that transitively imports it) never touches the network.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
	if (!db) {
		pool = new Pool({ connectionString: process.env["DATABASE_URL"] ?? "" });
		db = drizzle(pool, { schema });
	}
	return db;
}

export type Db = ReturnType<typeof getDb>;

export async function closePostgres(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
		db = null;
	}
}
