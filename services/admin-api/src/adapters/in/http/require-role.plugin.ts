/**
 * HTTP inbound adapter: admin role/capability guard.
 *
 * Responsibilities (deny-by-default throughout):
 *  1. Verify the bearer token via the injected `@bio/auth-kit` verifier.
 *  2. Resolve verified claims into an {@link AdminAuthContext} (capabilities
 *     resolved through the {@link AuthorizationPolicyPort}).
 *  3. Expose `adminAuth` on the request context for downstream handlers.
 *  4. Provide a `requireRole` macro that enforces a {@link RoleRequirement}
 *     before the handler runs, returning 401 (no/!valid token) or 403
 *     (authenticated but lacking the capability/role).
 *
 * `@bio/auth-kit` is not imported directly: the verifier is injected through
 * {@link AuthKitTokenVerifier}, so the concrete package plugs in at composition
 * time and tests can supply a fake.
 */

import { Elysia } from "elysia";

import type {
	AdminAuthContext,
	RequireRole,
	RoleRequirement,
} from "../../../core/ports/in/index.ts";
import type {
	AdminCapability,
	AdminRole,
	AuthKitClaims,
	AuthorizationPolicyPort,
} from "../../../core/ports/out/index.ts";
import { ADMIN_CAPABILITY_MAP, ADMIN_ROLES } from "../../../core/ports/out/index.ts";

/**
 * The seam to `@bio/auth-kit` token verification. Returns the verified claims,
 * or `null` when the token is absent, invalid, or expired (deny-by-default).
 */
export interface AuthKitTokenVerifier {
	verify(token: string): Promise<AuthKitClaims | null> | AuthKitClaims | null;
}

/** Options for {@link requireRolePlugin}. */
export interface RequireRolePluginOptions {
	/** Verifier over `@bio/auth-kit`. Required — there is no insecure default. */
	readonly verifier: AuthKitTokenVerifier;
	/** Policy used to resolve capabilities; defaults to {@link denyByDefaultPolicy}. */
	readonly policy?: AuthorizationPolicyPort | undefined;
}

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set<string>(ADMIN_ROLES);

const isAdminRole = (role: string): role is AdminRole => ADMIN_ROLE_SET.has(role);

/**
 * Resolve the capability set granted by the claims. Unknown roles contribute
 * nothing; capabilities not listed for a role are never granted.
 */
const resolveCapabilities = (claims: AuthKitClaims): ReadonlySet<AdminCapability> => {
	const granted = new Set<AdminCapability>();
	for (const role of claims.roles) {
		if (isAdminRole(role)) {
			for (const capability of ADMIN_CAPABILITY_MAP[role]) {
				granted.add(capability);
			}
		}
	}
	return granted;
};

/** Deny-by-default {@link AuthorizationPolicyPort} backed by `ADMIN_CAPABILITY_MAP`. */
export const denyByDefaultPolicy: AuthorizationPolicyPort = {
	resolveCapabilities,
	authorize(claims, capability) {
		return resolveCapabilities(claims).has(capability)
			? { allowed: true, reason: `capability granted: ${capability}` }
			: { allowed: false, reason: `capability denied (not granted): ${capability}` };
	},
};

/**
 * {@link RequireRole} implementation. Deny-by-default: a `null` context, a
 * missing capability, or an unmet `anyOf` role list all deny.
 */
export const requireRoleEnforcer: RequireRole = {
	enforce(context, requirement) {
		if (context === null) {
			return { allowed: false, reason: "unauthenticated: no valid admin token" };
		}
		if (!context.capabilities.has(requirement.capability)) {
			return {
				allowed: false,
				reason: `forbidden: missing capability ${requirement.capability}`,
			};
		}
		if (requirement.anyOf !== undefined && requirement.anyOf.length > 0) {
			const hasRole = requirement.anyOf.some((role) => context.roles.includes(role));
			if (!hasRole) {
				return {
					allowed: false,
					reason: `forbidden: requires one of roles [${requirement.anyOf.join(", ")}]`,
				};
			}
		}
		return { allowed: true, reason: `authorized: ${requirement.capability}` };
	},
};

/** Extract a bearer token from an Authorization header, or `null`. */
const extractBearerToken = (authorization: string | undefined): string | null => {
	if (authorization === undefined) {
		return null;
	}
	const [scheme, token] = authorization.split(" ");
	if (scheme === undefined || scheme.toLowerCase() !== "bearer" || !token) {
		return null;
	}
	return token;
};

const toAuthContext = (
	claims: AuthKitClaims,
	policy: AuthorizationPolicyPort,
): AdminAuthContext => ({
	adminId: claims.sub,
	roles: claims.roles.filter(isAdminRole),
	capabilities: policy.resolveCapabilities(claims),
	sessionId: claims.sessionId,
	mfaSatisfied: claims.mfa ?? false,
});

/** Verify a token without throwing; any verifier error denies (returns null). */
const safeVerify = async (
	verifier: AuthKitTokenVerifier,
	token: string,
): Promise<AuthKitClaims | null> => {
	try {
		return await verifier.verify(token);
	} catch {
		return null;
	}
};

/**
 * Resolve a request's Authorization header into an {@link AdminAuthContext}, or
 * `null` when there is no valid, verifiable admin token.
 */
export const resolveAdminAuthContext = async (
	authorization: string | undefined,
	verifier: AuthKitTokenVerifier,
	policy: AuthorizationPolicyPort,
): Promise<AdminAuthContext | null> => {
	const token = extractBearerToken(authorization);
	if (token === null) {
		return null;
	}
	const claims = await safeVerify(verifier, token);
	if (claims === null) {
		return null;
	}
	return toAuthContext(claims, policy);
};

const denyResponse = (context: AdminAuthContext | null, reason: string) => ({
	success: false as const,
	error: {
		code: context === null ? "UNAUTHORIZED" : "FORBIDDEN",
		message: reason,
		statusCode: context === null ? 401 : 403,
	},
});

/**
 * Build the admin role-guard Elysia plugin.
 *
 * Adds `adminAuth: AdminAuthContext | null` to the request context and a
 * `requireRole` macro for routes:
 *
 * ```ts
 * app.use(requireRolePlugin({ verifier }))
 *    .get("/admin/exams", handler, { requireRole: { capability: "exam:publish" } });
 * ```
 */
export const requireRolePlugin = (options: RequireRolePluginOptions) => {
	const policy = options.policy ?? denyByDefaultPolicy;
	const { verifier } = options;

	return new Elysia({ name: "require-role" })
		.derive({ as: "global" }, async ({ headers }) => ({
			adminAuth: await resolveAdminAuthContext(headers["authorization"], verifier, policy),
		}))
		.macro({
			requireRole(requirement: RoleRequirement) {
				return {
					beforeHandle({
						adminAuth,
						set,
					}: {
						adminAuth: AdminAuthContext | null;
						set: { status?: number | string };
					}) {
						const decision = requireRoleEnforcer.enforce(adminAuth, requirement);
						if (!decision.allowed) {
							set.status = adminAuth === null ? 401 : 403;
							return denyResponse(adminAuth, decision.reason);
						}
						return undefined;
					},
				};
			},
		});
};
