import { createHmac } from "node:crypto";

function base64url(input: Buffer | string): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Sign a test HS256 JWT matching the shared-JWT shape (`{ sub, email, role }`)
 * issued by `backend/src/auth/auth.controller.ts` and verified by
 * `src/adapters/in/http/auth.plugin.ts`'s `verifyJwt`. Test-only: real tokens
 * are signed by the legacy NestJS backend.
 */
export function signTestJwt(payload: Record<string, unknown>, secret: string): string {
	const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = base64url(JSON.stringify(payload));
	const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest();
	return `${header}.${body}.${base64url(signature)}`;
}
