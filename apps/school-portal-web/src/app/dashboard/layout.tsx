"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { SchoolNav } from "../../components/school-nav";
import { ThemeToggle } from "../../components/theme-toggle";
import { portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { useResource } from "../../lib/use-resource";

export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
	const { token, signOut } = useAuth();
	const router = useRouter();
	const { data: profile } = useResource(portalApi.profile);

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
						<strong>{profile?.name ?? "Your school"}</strong>
						{profile && (
							<span className="muted">
								{" "}
								· {profile.code} · {profile.board ?? "—"}
							</span>
						)}
					</div>
					<div className="inline">
						<span className="badge badge--positive">
							{profile?.status === "PENDING" ? "Pending" : "Active"}
						</span>
						<ThemeToggle />
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={signOut}
						>
							Sign out
						</button>
					</div>
				</div>
				{children}
			</div>
		</div>
	);
}
