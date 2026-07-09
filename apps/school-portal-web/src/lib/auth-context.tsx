"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const TOKEN_STORAGE_KEY = "bio-school-portal.access-token";

/**
 * The subset of the shared-JWT payload (`{ sub, email, role }`, issued by the
 * legacy backend's `auth.controller.ts`) this app reads client-side. This is a
 * display-only decode (no signature check) — a real school-coordinator auth
 * front door (SCHOOL_ADMIN role) is a backend follow-up; until then the shared
 * token is the entry point, mirroring the partner portal.
 */
export interface TokenClaims {
	readonly sub: string;
	readonly email?: string;
	readonly role?: string;
	readonly exp?: number;
}

function decodeTokenClaims(token: string): TokenClaims | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const payloadSegment = parts[1] ?? "";
		const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		return JSON.parse(atob(padded)) as TokenClaims;
	} catch {
		return null;
	}
}

interface AuthState {
	/** `undefined` until the client has read localStorage once (avoids SSR flash). */
	readonly token: string | null | undefined;
	readonly claims: TokenClaims | null;
	setToken(token: string | null): void;
	signOut(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
	const [token, setTokenState] = useState<string | null | undefined>(undefined);

	useEffect(() => {
		setTokenState(window.localStorage.getItem(TOKEN_STORAGE_KEY));
	}, []);

	const setToken = useCallback((next: string | null) => {
		if (next) {
			window.localStorage.setItem(TOKEN_STORAGE_KEY, next);
		} else {
			window.localStorage.removeItem(TOKEN_STORAGE_KEY);
		}
		setTokenState(next);
	}, []);

	const signOut = useCallback(() => setToken(null), [setToken]);
	const claims = useMemo(() => (token ? decodeTokenClaims(token) : null), [token]);

	const value = useMemo<AuthState>(
		() => ({ token, claims, setToken, signOut }),
		[token, claims, setToken, signOut],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used within <AuthProvider>");
	return context;
}
