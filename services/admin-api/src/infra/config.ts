/**
 * Environment-derived runtime configuration consumed by adapters at request
 * time (e.g. `auth.plugin.ts`'s JWT verification).
 *
 * This mirrors `services/exam-api/src/infra/config.ts`'s shape exactly, so
 * `auth.plugin.ts` can be copied over with only its import path adjusted.
 * It intentionally reads `process.env` directly (no zod, no throwing) rather
 * than delegating to `../config/admin-config.ts`'s fail-closed
 * `loadAdminConfig()`: that loader is the authoritative boot-time gate,
 * invoked explicitly (and only) from `index.ts` inside a try/catch. Routing
 * this singleton through it too would re-run (and could throw on) full
 * config validation at *module import* time — before `index.ts`'s own
 * fail-closed check has a chance to log a friendly fatal error and exit, and
 * before any test has a chance to set up its environment. `index.ts` still
 * refuses to boot on a missing `JWT_SECRET` (it is a required field in
 * `adminConfigSchema`); this module only affects how the value is *read* at
 * request time once that boot gate has already passed.
 *
 * `jwtSecret` is a getter (not a value captured once at import time) so that
 * setting `process.env.JWT_SECRET` at any point before a request is handled
 * — e.g. in a test's setup, after this module has already been imported
 * transitively via `app.ts` — is always honoured. A plain captured value
 * would freeze in whatever `process.env` held at first import, which for ESM
 * (imports evaluate before the importing file's own body runs) can be before
 * a test ever gets a chance to set it.
 */
export interface RuntimeConfig {
	readonly jwtSecret: string;
}

export const config: RuntimeConfig = {
	get jwtSecret(): string {
		return process.env["JWT_SECRET"] ?? "";
	},
};
