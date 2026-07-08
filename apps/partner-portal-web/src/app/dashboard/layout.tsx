"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { DashboardNav } from "../../components/dashboard-nav";
import { ApiError, portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { PartnerApplication } from "../../lib/types";

/**
 * Gate for the whole `/dashboard/*` tree (PRD-011: "Routes must be gated on
 * approved status; a partner with a SUBMITTED or REJECTED application should
 * not reach the dashboard").
 *
 * This is a client-side convenience redirect, not the real enforcement — the
 * real guarantee is server-side: every `/partner/*` dashboard route in
 * portal-api calls `requireApprovedPartner` and returns 403 for anything but
 * an APPROVED application (see
 * `services/portal-api/src/adapters/in/http/require-approved-partner.ts` and
 * its tests). This layout just avoids flashing dashboard chrome at a partner
 * who cannot use it.
 */
export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
	const { token } = useAuth();
	const router = useRouter();
	const [application, setApplication] = useState<PartnerApplication | null>(null);
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		if (token === undefined) return;
		if (!token) {
			router.replace("/login");
			return;
		}

		let cancelled = false;
		portalApi
			.getMyApplication(token)
			.then((data) => {
				if (cancelled) return;
				if (data.status !== "APPROVED") {
					router.replace("/apply");
					return;
				}
				setApplication(data);
				setChecking(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				if (error instanceof ApiError && error.statusCode === 404) {
					router.replace("/apply");
					return;
				}
				router.replace("/apply");
			});
		return () => {
			cancelled = true;
		};
	}, [token, router]);

	if (checking || !application) {
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
						<strong>{application.orgName}</strong>
						<span className="muted"> · Approved partner</span>
					</div>
				</div>
				{children}
			</div>
		</div>
	);
}
