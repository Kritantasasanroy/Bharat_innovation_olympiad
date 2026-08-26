"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PartnerStepGuide } from "../../components/step-guide";
import { ApiError, type PartnerSchool, partnerSchoolApi, portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { PartnerFunnel } from "../../lib/types";
import { usePoll } from "../../lib/use-poll";

const STATUS_BADGE: Record<PartnerSchool["status"], string> = {
	PENDING: "badge badge--pending",
	APPROVED: "badge badge--positive",
	REJECTED: "badge badge--negative",
	REVOKED: "badge badge--negative",
};

export default function DashboardOverviewPage() {
	const { token } = useAuth();
	const [funnel, setFunnel] = useState<PartnerFunnel | null>(null);
	const [schools, setSchools] = useState<PartnerSchool[]>([]);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const [f, s] = await Promise.all([portalApi.getFunnel(token), partnerSchoolApi.list(token)]);
			setFunnel(f);
			setSchools(s);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to load");
		}
	}, [token]);

	usePoll(load);

	const recentSchools = schools.slice(0, 6);

	return (
		<main>
			<div className="page-header">
				<h1>Overview</h1>
				<p>
					Everything you&apos;ve brought in — students credited to your referral links, and schools
					you&apos;ve onboarded — updated live.
				</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			<PartnerStepGuide defaultOpen={false} />

			{funnel ? (
				<>
					<div className="stat-row">
						<div className="stat-tile">
							<span className="stat-tile__label">Student signups</span>
							<span className="stat-tile__value">{funnel.totals.signups}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Paid conversions</span>
							<span className="stat-tile__value">{funnel.totals.paid}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Schools onboarded</span>
							<span className="stat-tile__value">{schools.length}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Campaigns</span>
							<span className="stat-tile__value">{funnel.campaigns.length}</span>
						</div>
					</div>

					<div className="card">
						<h2>Schools you&apos;ve brought in</h2>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>School</th>
										<th>Location</th>
										<th>Via</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									{recentSchools.map((school) => (
										<tr key={school.id}>
											<td>
												<strong>{school.schoolName}</strong>
											</td>
											<td className="muted">
												{school.city}, {school.state}
											</td>
											<td className="muted">
												{school.submittedViaReferralCode ? "Campaign link" : "Direct"}
											</td>
											<td>
												<span className={STATUS_BADGE[school.status]}>{school.status}</span>
											</td>
										</tr>
									))}
									{schools.length === 0 ? (
										<tr>
											<td colSpan={4} className="muted">
												No schools yet — onboard one from the Schools tab.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
						<p style={{ marginTop: "1rem" }}>
							<Link href="/dashboard/schools">Onboard a school →</Link>
						</p>
					</div>
				</>
			) : !error ? (
				<p className="muted">Loading…</p>
			) : null}
		</main>
	);
}
