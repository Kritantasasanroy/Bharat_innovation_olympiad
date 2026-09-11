import type { PoolConfig } from "pg";

/**
 * TLS settings for the Postgres pool.
 *
 * `node-postgres` connects in **plaintext** unless it is told otherwise, and a
 * managed Postgres normally refuses that. AWS RDS with `rds.force_ssl=1` answers
 *
 *     no pg_hba.conf entry for host "…", user "…", database "…", no encryption
 *
 * which Drizzle then re-throws as a bare `Failed query: select …`. The SQL in
 * that message is a red herring — the statement never ran, the *connection* was
 * refused — so it reads like a schema fault and sends you looking for a missing
 * table. On dev it made every partner call from the admin console fail with a
 * 500 while `psql` against the same URL worked, because libpq negotiates TLS on
 * its own and node-postgres does not.
 *
 * Prisma, which the legacy backend uses against this same database, defaults to
 * `sslmode=prefer`: encrypted, server certificate not verified. This matches
 * that, so the two clients behave the same way against the same host.
 *
 * Verification is off because RDS presents an Amazon-issued certificate that is
 * not in Node's trust store; turning it on means shipping the RDS CA bundle in
 * the image. The connection is inside the VPC, from a private subnet to a
 * private-subnet database, so the exposure is the same one Prisma already
 * accepts here. An explicit `sslmode=` in the URL always wins over this
 * default — that is how an environment opts into `verify-full` with a CA.
 */
export function sslConfigFor(connectionString: string): PoolConfig["ssl"] {
	// An explicit sslmode in the URL is the operator's decision: let
	// pg-connection-string parse it rather than overriding it here.
	if (/[?&]sslmode=/i.test(connectionString)) return undefined;

	// A local or in-container Postgres has no TLS at all; forcing it there turns
	// every developer's `docker compose up` into a connection error.
	if (
		/@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|postgres)[:/]/i.test(connectionString)
	) {
		return undefined;
	}

	return { rejectUnauthorized: false };
}
