import { createHmac, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { DomainError, ForbiddenError } from "../../../core/errors";
import { config } from "../../../infra/config";

/** Thrown when a request is missing or presents an invalid bearer token. */
export class UnauthorizedError extends DomainError {
	constructor(message = "Authentication required") {
		super(message, "UNAUTHORIZED", 401);
	}
}

export interface AuthContext {
	readonly userId: string;
	readonly role: string | undefined;
}

interface JwtPayload {
	readonly sub?: string;
	readonly id?: string;
	readonly role?: string;
	readonly exp?: number;
}

function base64UrlDecode(input: string): Buffer {
	return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Verify an HS256 JWT signed with the shared `JWT_SECRET` (matches the NestJS
 * backend, `backend/src/auth/auth.controller.ts`). Copied verbatim from
 * `services/exam-api/src/adapters/in/http/auth.plugin.ts` — this is the same
 * shared-JWT pattern every BIO service verifies against, so it must not drift.
 */
export function verifyJwt(token: string, secret: string): AuthContext | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, payload, signature] = parts as [string, string, string];

	const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
	const provided = base64UrlDecode(signature);
	if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
		return null;
	}

	let decoded: JwtPayload;
	try {
		decoded = JSON.parse(base64UrlDecode(payload).toString("utf8")) as JwtPayload;
	} catch {
		return null;
	}
	if (decoded.exp && Date.now() / 1000 > decoded.exp) return null;

	const userId = decoded.sub ?? decoded.id;
	if (!userId) return null;
	return { userId: String(userId), role: decoded.role };
}

/**
 * Build the scoped auth-derive plugin for a given JWT secret.
 *
 * Factored as a function (rather than exporting a single module-level
 * singleton, as `exam-api` does) purely so tests can point it at a
 * test-only secret without touching `process.env`/module-load ordering —
 * the verification logic above (`verifyJwt`) is unchanged from exam-api.
 *
 * Also exposes the raw bearer `token` alongside the decoded `auth` context:
 * portal-api is a BFF that forwards the caller's token to `admin-api`
 * (Authorization pass-through), which exam-api has no need for.
 */
export function createAuthPlugin(secret: string) {
	return new Elysia({ name: "auth" }).derive({ as: "scoped" }, ({ headers }) => {
		const raw = headers["authorization"] ?? "";
		const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
		const auth = token ? verifyJwt(token, secret) : null;
		return { auth, token: token || null };
	});
}

/** Default instance wired to the process-wide config secret (production app). */
export const authPlugin = createAuthPlugin(config.jwtSecret);

/** Assert an authenticated context or throw 401. */
export function requireAuth(auth: AuthContext | null): AuthContext {
	if (!auth) throw new UnauthorizedError();
	return auth;
}

/**
 * Assert the caller is authenticated AND holds the `PARTNER` role.
 *
 * Every partner-facing route in this service must go through this (never
 * `requireAuth` alone) and must use the returned `userId` as the partner id
 * for every downstream `admin-api` call — never a client-supplied id from
 * the URL or body. That is the entire "no cross-partner leakage" guarantee.
 */
export function requirePartnerAuth(auth: AuthContext | null): AuthContext {
	const user = requireAuth(auth);
	if (user.role !== "PARTNER") {
		throw new ForbiddenError("Partner role required", "PARTNER_ROLE_REQUIRED");
	}
	return user;
}
