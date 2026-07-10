"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { DashboardNav } from "../../components/dashboard-nav";
import { type ApprovedPartner, ApiError, portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";

/**
 * Gate for the whole `/dashboard/*` tree (PRD-011: "Routes must be gated on
 * approved status").
 *
 * This is a client-side convenience redirect, not the real enforcement — the
 * real guarantee is server-side: every `/partner/*` dashboard route in
 * portal-api calls `requireApprovedPartner`, which reads the admin-api
 * `Partner.status` on every request. So when staff REVOKE a partner, the next
 * `getMe` here returns 403 and we bounce them out, even though their token is
 * still cryptographically valid.
 */
export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
	const { token, signOut } = useAuth();
	const router = useRouter();
	const [partner, setPartner] = useState<ApprovedPartner | null>(null);
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		if (token === undefined) return;
		if (!token) {
			router.replace("/login");
			return;
		}

		let cancelled = false;
		portalApi
			.getMe(token)
			.then((data) => {
				if (cancelled) return;
				setPartner(data);
				setChecking(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				// 403 => not approved / revoked; 401 => bad or expired token.
				if (error instanceof ApiError && error.statusCode === 401) {
					signOut();
				}
				router.replace("/login");
			});
		return () => {
			cancelled = true;
		};
	}, [token, router, signOut]);

	if (checking || !partner) {
		return (
			<main className="page">
				<p className="muted">Checking your partner status…</p>
			</main>
		);
	}

	return (
		<div className="app-shell">
			<DashboardNav />
			<div className="dashboard-content">
				<div className="top-bar">
					<div>
						<strong>{partner.orgName}</strong>
						<span className="muted"> · Approved partner</span>
					</div>
					<button
						type="button"
						className="button button--secondary button--small"
						onClick={() => {
							signOut();
							router.replace("/login");
						}}
					>
						Sign out
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
