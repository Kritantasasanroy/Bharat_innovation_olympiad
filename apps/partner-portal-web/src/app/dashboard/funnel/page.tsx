"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { PartnerFunnel } from "../../../lib/types";

export default function FunnelPage() {
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
				<h1>Conversion funnel</h1>
				<p>Leads → signups → paid, overall and per campaign.</p>
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
					</div>

					<div className="card">
						<h2>Per-campaign breakdown</h2>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Campaign</th>
										<th>Status</th>
										<th>Signups</th>
										<th>Registrations</th>
										<th>Paid</th>
										<th>Paid rate</th>
									</tr>
								</thead>
								<tbody>
									{funnel.campaigns.map((campaign) => (
										<tr key={campaign.campaignId}>
											<td>{campaign.name}</td>
											<td>
												<StatusBadge status={campaign.status} />
											</td>
											<td>{campaign.signups}</td>
											<td>{campaign.registrations}</td>
											<td>{campaign.paid}</td>
											<td>{formatRate(campaign.paid, campaign.signups)}</td>
										</tr>
									))}
									{funnel.campaigns.length === 0 ? (
										<tr>
											<td colSpan={6} className="muted">
												No campaigns yet.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>
				</>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}

function formatRate(numerator: number, denominator: number): string {
	if (denominator === 0) return "—";
	return `${Math.round((numerator / denominator) * 100)}%`;
}
