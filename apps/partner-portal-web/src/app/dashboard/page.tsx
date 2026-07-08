"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { PartnerFunnel } from "../../lib/types";

export default function DashboardOverviewPage() {
	const { token } = useAuth();
	const [funnel, setFunnel] = useState<PartnerFunnel | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!token) return;
		portalApi
			.getFunnel(token)
			.then(setFunnel)
			.catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load"));
	}, [token]);

	return (
		<main>
			<div className="page-header">
				<h1>Overview</h1>
				<p>
					Registrations and paid conversions credited to your referral links appear here
					automatically — pulled live from the conversion funnel.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			{funnel ? (
				<>
					<div className="stat-row">
						<div className="stat-tile">
							<span className="stat-tile__label">Leads</span>
							<span className="stat-tile__value">{funnel.totals.leads}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Signups</span>
							<span className="stat-tile__value">{funnel.totals.signups}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Paid conversions</span>
							<span className="stat-tile__value">{funnel.totals.paidConversions}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Assigned institutions</span>
							<span className="stat-tile__value">{funnel.institutions.length}</span>
						</div>
					</div>

					<div className="card">
						<h2>Your institutions</h2>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Institution</th>
										<th>Leads</th>
										<th>Signups</th>
										<th>Paid</th>
									</tr>
								</thead>
								<tbody>
									{funnel.institutions.map((institution) => (
										<tr key={institution.institutionId}>
											<td>{institution.institutionName}</td>
											<td>{institution.leads}</td>
											<td>{institution.signups}</td>
											<td>{institution.paidConversions}</td>
										</tr>
									))}
									{funnel.institutions.length === 0 ? (
										<tr>
											<td colSpan={4} className="muted">
												No institutions assigned yet.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
						<p style={{ marginTop: "1rem" }}>
							<Link href="/dashboard/institutions">View detailed institution performance →</Link>
						</p>
					</div>
				</>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}
