"use client";

import Image from "next/image";
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
			<div style={{ textAlign: "center", marginBottom: "2rem" }}>
				<Image
					src="/bio-logo.png"
					alt="Bharat Innovation Olympiad"
					width={211}
					height={64}
					style={{ height: "64px", width: "auto", objectFit: "contain" }}
				/>
				<p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
					by Lemon Ideas · Become Future Ready
				</p>
			</div>
			<div className="page-header">
				<h1>BIO Partner Portal</h1>
				<p>
					Apply as a channel partner for the Bharat Innovation Olympiad, an initiative by Lemon
					Ideas. Run referral campaigns, track conversions, and earn payouts — all self-service.
					Become Future Ready.
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
