import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sslConfigFor } from "./pool-ssl";
import * as schema from "./schema/schema";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Lazily-initialized Drizzle client bound to the shared Postgres database. */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
	if (!db) {
		const connectionString = process.env["DATABASE_URL"] ?? "";
		pool = new Pool({ connectionString, ssl: sslConfigFor(connectionString) });
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
