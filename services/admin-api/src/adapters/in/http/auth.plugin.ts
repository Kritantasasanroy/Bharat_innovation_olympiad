import { createHmac, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { DomainError } from "../../../core/errors";
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

/** Verify an HS256 JWT signed with the shared `JWT_SECRET` (matches the NestJS backend). */
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

/** Scoped plugin that decodes the bearer token into `auth` (null when absent/invalid). */
export const authPlugin = new Elysia({ name: "auth" }).derive({ as: "scoped" }, ({ headers }) => {
	const raw = headers["authorization"] ?? "";
	const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
	const auth = token ? verifyJwt(token, config.jwtSecret) : null;
	return { auth };
});

/** Assert an authenticated context or throw 401. */
export function requireAuth(auth: AuthContext | null): AuthContext {
	if (!auth) throw new UnauthorizedError();
	return auth;
}
