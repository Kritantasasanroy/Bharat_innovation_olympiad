"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { SchoolNav } from "../../components/school-nav";
import { useAuth } from "../../lib/auth-context";
import { school } from "../../lib/school-data";

export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
	const { token, signOut } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (token === undefined) return;
		if (!token) router.replace("/login");
	}, [token, router]);

	if (token === undefined) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}

	if (!token) return null;

	return (
		<div className="app-shell">
			<SchoolNav />
			<div className="dashboard-content">
				<div className="top-bar">
					<div>
						<strong>{school.name}</strong>
						<span className="muted"> · {school.code} · {school.board}</span>
					</div>
					<div className="inline">
						<span className="badge badge--positive">Active</span>
						<button type="button" className="button button--secondary button--small" onClick={signOut}>
							Sign out
						</button>
					</div>
				</div>
				{children}
			</div>
		</div>
	);
}
