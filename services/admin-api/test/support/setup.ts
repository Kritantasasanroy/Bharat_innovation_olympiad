import { TEST_JWT_SECRET } from "./jwt";

/**
 * Global test preload (see `bunfig.toml`'s `[test].preload`).
 *
 * Ensures `JWT_SECRET` is set before ANY test file (or its imports) runs, so
 * `auth.plugin.ts`'s JWT verification (read via `infra/config.ts`'s lazy
 * `config.jwtSecret` getter) always sees the same secret the tests sign
 * tokens with, regardless of file execution order.
 */
process.env["JWT_SECRET"] ??= TEST_JWT_SECRET;
