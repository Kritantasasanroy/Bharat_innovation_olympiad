"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "../components/theme-toggle";
import { useAuth } from "../lib/auth-context";

export default function HomePage() {
	const { token, claims } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (token === undefined) return; // still hydrating from localStorage
		if (token && claims?.role === "PARTNER") router.replace("/dashboard");
	}, [token, claims, router]);

	if (token === undefined) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}

	return (
		<main className="page">
			<div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}>
				<ThemeToggle />
			</div>
			<div className="page-header">
				<h1>BIO Partner Portal</h1>
				<p>
					Apply as a channel partner, run referral campaigns for institutions and students, and
					track conversions, commission statements, and payouts — all self-service.
				</p>
			</div>

			{token && claims && claims.role !== "PARTNER" ? (
				<div className="notice notice--error">
					Signed in as role &ldquo;{claims.role ?? "unknown"}&rdquo;. This portal is for BIO channel
					partners only (role <code>PARTNER</code>).
				</div>
			) : null}

			<div className="card">
				<h2>Get started</h2>
				<p className="muted">
					New partners request access with their organisation details and a password. Once our team
					approves the request, sign in to get your dashboard: assigned institutions, referral
					links, conversion funnel, and payouts.
				</p>
				<div className="inline" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
					<Link href="/apply" className="button">
						Request access
					</Link>
					<Link href="/login" className="button button--secondary">
						Sign in
					</Link>
				</div>
			</div>
		</main>
	);
}
