"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";

export default function HomePage() {
	const { token, claims } = useAuth();
	const router = useRouter();
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		if (token === undefined) return; // still hydrating from localStorage
		if (!token) {
			setChecking(false);
			return;
		}

		let cancelled = false;
		portalApi
			.getMyApplication(token)
			.then((application) => {
				if (cancelled) return;
				router.replace(application.status === "APPROVED" ? "/dashboard" : "/apply");
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				if (error instanceof ApiError && error.statusCode === 404) {
					router.replace("/apply");
					return;
				}
				setChecking(false);
			});
		return () => {
			cancelled = true;
		};
	}, [token, router]);

	if (token === undefined || (token && checking)) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}

	return (
		<main className="page">
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
					New partners submit an onboarding application; approved partners get a dashboard with
					their assigned institutions, referral links, conversion funnel, and payouts.
				</p>
				<Link href="/login" className="button">
					Sign in
				</Link>
			</div>
		</main>
	);
}
