import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import {
	type AuthKitTokenVerifier,
	denyByDefaultPolicy,
	requireRoleEnforcer,
	requireRolePlugin,
	resolveAdminAuthContext,
} from "../src/adapters/in/http/require-role.plugin";
import type { AuthKitClaims } from "../src/core/ports/out/index.ts";

const claims = (roles: string[], extra: Partial<AuthKitClaims> = {}): AuthKitClaims => ({
	sub: "admin-1",
	roles,
	...extra,
});

/** Verifier that maps known tokens to claims; everything else fails (null). */
const fakeVerifier = (table: Record<string, AuthKitClaims>): AuthKitTokenVerifier => ({
	verify: (token) => table[token] ?? null,
});

describe("denyByDefaultPolicy", () => {
	it("grants only mapped capabilities for a role", () => {
		const caps = denyByDefaultPolicy.resolveCapabilities(claims(["CONTENT_CURATOR"]));
		expect(caps.has("question:edit")).toBe(true);
		// Guardrail: a curator cannot publish.
		expect(caps.has("exam:publish")).toBe(false);
	});

	it("grants nothing for unknown roles (deny-by-default)", () => {
		const caps = denyByDefaultPolicy.resolveCapabilities(claims(["NOT_A_ROLE"]));
		expect(caps.size).toBe(0);
	});

	it("denies a capability that no role grants", () => {
		const decision = denyByDefaultPolicy.authorize(claims(["SUPPORT"]), "answer-key:view");
		expect(decision.allowed).toBe(false);
	});

	it("super admin holds every capability", () => {
		const decision = denyByDefaultPolicy.authorize(claims(["SUPER_ADMIN"]), "exam:publish");
		expect(decision.allowed).toBe(true);
	});
});

describe("requireRoleEnforcer", () => {
	it("denies a null context", () => {
		expect(requireRoleEnforcer.enforce(null, { capability: "exam:publish" }).allowed).toBe(false);
	});

	it("denies when capability is missing", () => {
		const ctx = {
			adminId: "a",
			roles: ["SCHEDULER"] as const,
			capabilities: new Set<"slot:schedule">(["slot:schedule"]),
			sessionId: undefined,
			mfaSatisfied: true,
		};
		expect(requireRoleEnforcer.enforce(ctx, { capability: "result:release" }).allowed).toBe(false);
	});

	it("enforces the anyOf role narrowing", () => {
		const ctx = {
			adminId: "a",
			roles: ["SCHEDULER"] as const,
			capabilities: new Set<"exam:publish">(["exam:publish"]),
			sessionId: undefined,
			mfaSatisfied: true,
		};
		expect(
			requireRoleEnforcer.enforce(ctx, { capability: "exam:publish", anyOf: ["SUPER_ADMIN"] })
				.allowed,
		).toBe(false);
		expect(
			requireRoleEnforcer.enforce(ctx, { capability: "exam:publish", anyOf: ["SCHEDULER"] })
				.allowed,
		).toBe(true);
	});
});

describe("resolveAdminAuthContext", () => {
	const verifier = fakeVerifier({ "good-token": claims(["SCHEDULER"], { sessionId: "s1" }) });

	it("returns null without an Authorization header", async () => {
		expect(await resolveAdminAuthContext(undefined, verifier, denyByDefaultPolicy)).toBeNull();
	});

	it("returns null for a non-bearer scheme", async () => {
		expect(
			await resolveAdminAuthContext("Basic good-token", verifier, denyByDefaultPolicy),
		).toBeNull();
	});

	it("returns null for an unverifiable token", async () => {
		expect(
			await resolveAdminAuthContext("Bearer bad-token", verifier, denyByDefaultPolicy),
		).toBeNull();
	});

	it("resolves a verified token into a context with capabilities", async () => {
		const ctx = await resolveAdminAuthContext("Bearer good-token", verifier, denyByDefaultPolicy);
		expect(ctx?.adminId).toBe("admin-1");
		expect(ctx?.sessionId).toBe("s1");
		expect(ctx?.capabilities.has("exam:publish")).toBe(true);
	});
});

describe("requireRolePlugin", () => {
	const verifier = fakeVerifier({
		scheduler: claims(["SCHEDULER"]),
		curator: claims(["CONTENT_CURATOR"]),
	});

	const app = new Elysia()
		.use(requireRolePlugin({ verifier }))
		.get("/admin/publish", () => ({ ok: true }), { requireRole: { capability: "exam:publish" } });

	it("returns 401 without a token", async () => {
		const res = await app.handle(new Request("http://localhost/admin/publish"));
		expect(res.status).toBe(401);
	});

	it("returns 403 when authenticated but lacking the capability", async () => {
		const res = await app.handle(
			new Request("http://localhost/admin/publish", {
				headers: { authorization: "Bearer curator" },
			}),
		);
		expect(res.status).toBe(403);
	});

	it("allows a holder of the capability", async () => {
		const res = await app.handle(
			new Request("http://localhost/admin/publish", {
				headers: { authorization: "Bearer scheduler" },
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});
});
