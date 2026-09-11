import { describe, expect, it } from "bun:test";
import { sslConfigFor } from "../src/adapters/out/persistence/pool-ssl";

/**
 * The regression this file exists for.
 *
 * `node-postgres` connects in plaintext by default. AWS RDS with
 * `rds.force_ssl=1` refuses that, and Drizzle reports the refusal as
 * `Failed query: select … from "Partner"` — a message that names a table and a
 * statement neither of which is at fault. On dev that produced a 500 on every
 * partner call from the admin console while `psql` against the identical URL
 * worked, because libpq negotiates TLS on its own.
 *
 * So: a remote host gets TLS whether or not anyone remembered to put `sslmode`
 * in the URL, and a local one keeps working without it.
 */
describe("sslConfigFor", () => {
	const RDS =
		"postgresql://u:p@bio-dev-postgres.c5e6aa28eo6q.ap-south-2.rds.amazonaws.com:5432/olympiad";

	it("turns TLS on for a managed host with no sslmode in the URL", () => {
		expect(sslConfigFor(RDS)).toEqual({ rejectUnauthorized: false });
	});

	it("turns TLS on for other managed providers too", () => {
		for (const url of [
			"postgres://u:p@ep-cool-name.ap-southeast-1.aws.neon.tech/olympiad",
			"postgresql://u:p@db.example.internal:5432/olympiad",
		]) {
			expect(sslConfigFor(url)).toEqual({ rejectUnauthorized: false });
		}
	});

	// Otherwise every `docker compose up` breaks: a local Postgres speaks no TLS
	// at all, and forcing it turns development into a connection error.
	it("leaves a local database alone", () => {
		for (const host of ["localhost", "127.0.0.1", "host.docker.internal", "postgres"]) {
			expect(sslConfigFor(`postgresql://u:p@${host}:5432/olympiad`)).toBeUndefined();
		}
	});

	// An explicit sslmode is an operator decision — including `verify-full` with
	// a CA, which this default could only weaken. Let the URL win.
	it("defers to an explicit sslmode in the URL", () => {
		for (const mode of ["disable", "require", "no-verify", "verify-full"]) {
			expect(sslConfigFor(`${RDS}?sslmode=${mode}`)).toBeUndefined();
			expect(sslConfigFor(`${RDS}?application_name=bio&sslmode=${mode}`)).toBeUndefined();
		}
	});

	it("does not mistake a database named 'sslmode' for the parameter", () => {
		expect(sslConfigFor("postgresql://u:p@rds.amazonaws.com:5432/sslmode")).toEqual({
			rejectUnauthorized: false,
		});
	});
});
