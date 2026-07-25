import { createHmac } from "node:crypto";

/** The `JWT_SECRET` every test in this package signs/verifies against. */
export const TEST_JWT_SECRET = "test-only-shared-secret-do-not-use-in-prod";

function base64UrlEncode(input: Buffer | string): string {
	const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
	return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface TestJwtPayload {
	readonly sub: string;
	readonly email?: string;
	readonly role?: string;
	readonly exp?: number;
}

/**
 * Sign a minimal HS256 JWT matching the shape `auth.plugin.ts#verifyJwt`
 * expects (`{ sub, email, role }`, HMAC-SHA256 over `header.payload`). Used
 * across the partner-engine tests to mint bearer tokens for staff and
 * partner-owner callers without needing a real auth service.
 */
export function signTestJwt(payload: TestJwtPayload, secret: string = TEST_JWT_SECRET): string {
	const header = { alg: "HS256", typ: "JWT" };
	const encodedHeader = base64UrlEncode(JSON.stringify(header));
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signature = createHmac("sha256", secret)
		.update(`${encodedHeader}.${encodedPayload}`)
		.digest();
	return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

/** Bearer-auth header object for `signTestJwt`'s output. */
export function bearer(token: string): { authorization: string } {
	return { authorization: `Bearer ${token}` };
}
