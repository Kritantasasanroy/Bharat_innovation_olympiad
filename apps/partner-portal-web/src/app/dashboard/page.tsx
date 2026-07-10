"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { AssignedInstitution, PartnerFunnel } from "../../lib/types";

export default function DashboardOverviewPage() {
	const { token } = useAuth();
	const [funnel, setFunnel] = useState<PartnerFunnel | null>(null);
	const [institutions, setInstitutions] = useState<readonly AssignedInstitution[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!token) return;
		const fail = (err: unknown) =>
			setError(err instanceof ApiError ? err.message : "Failed to load");

		portalApi.getFunnel(token).then(setFunnel).catch(fail);
		portalApi
			.getInstitutions(token)
			.then((data) => setInstitutions(data.institutions))
			.catch(fail);
	}, [token]);

	return (
		<main>
			<div className="page-header">
				<h1>Overview</h1>
				<p>
					Signups and paid conversions credited to your referral links appear here automatically —
					pulled live from the conversion funnel.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			{funnel ? (
				<>
					<div className="stat-row">
						<div className="stat-tile">
							<span className="stat-tile__label">Signups</span>
							<span className="stat-tile__value">{funnel.totals.signups}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Registrations</span>
							<span className="stat-tile__value">{funnel.totals.registrations}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Paid conversions</span>
							<span className="stat-tile__value">{funnel.totals.paid}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Campaigns</span>
							<span className="stat-tile__value">{funnel.campaigns.length}</span>
						</div>
					</div>

					<div className="card">
						<h2>Your institutions</h2>
						<p className="muted" style={{ fontSize: "0.9rem" }}>
							Institutions assigned to you by the BIO team.
						</p>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Institution</th>
										<th>Assigned from</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									{(institutions ?? []).map((institution) => (
										<tr key={institution.institutionId}>
											<td>{institution.institutionId}</td>
											<td className="muted">
												{new Date(institution.effectiveFrom).toLocaleDateString()}
											</td>
											<td>
												<span
													className={
														institution.effectiveTo ? "badge badge--negative" : "badge badge--positive"
													}
												>
													{institution.effectiveTo ? "Ended" : "Active"}
												</span>
											</td>
										</tr>
									))}
									{institutions && institutions.length === 0 ? (
										<tr>
											<td colSpan={3} className="muted">
												No institutions assigned yet.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
						<p style={{ marginTop: "1rem" }}>
							<Link href="/dashboard/institutions">View your assigned institutions →</Link>
						</p>
					</div>
				</>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}
