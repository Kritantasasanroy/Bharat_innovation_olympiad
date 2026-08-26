"use client";

import { useCallback, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, type PartnerSchool, partnerSchoolApi, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { CampaignFunnelBreakdown, PartnerFunnel } from "../../../lib/types";
import { usePoll } from "../../../lib/use-poll";

function getCampaignType(cName: string): "STUDENT" | "SCHOOL" {
	const lower = cName.toLowerCase();
	if (
		lower.startsWith("[")
			? lower.startsWith("[school]")
			: lower.includes("school") || lower.includes("institution")
	) {
		return "SCHOOL";
	}
	return "STUDENT";
}

export default function FunnelPage() {
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

	const schoolsForCode = (code: string) =>
		schools.filter((s) => s.submittedViaReferralCode === code);

	const studentCampaigns = (funnel?.campaigns ?? []).filter(
		(c) => getCampaignType(c.name) === "STUDENT",
	);
	const schoolCampaigns = (funnel?.campaigns ?? []).filter(
		(c) => getCampaignType(c.name) === "SCHOOL",
	);

	return (
		<main>
			<div className="page-header">
				<h1>Conversion funnel</h1>
				<p>Students and schools you&apos;ve brought in, overall and per campaign.</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			{funnel ? (
				<>
					<div className="stat-row">
						<div className="stat-tile">
							<span className="stat-tile__label">Student signups</span>
							<span className="stat-tile__value">{funnel.totals.signups}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Registrations</span>
							<span className="stat-tile__value">{funnel.totals.registrations}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Exams completed</span>
							<span className="stat-tile__value">{funnel.totals.paid}</span>
						</div>
						<div className="stat-tile">
							<span className="stat-tile__label">Schools onboarded</span>
							<span className="stat-tile__value">{schools.length}</span>
						</div>
					</div>

					<div className="card" style={{ marginBottom: "1.5rem" }}>
						<h2>Student campaign breakdown</h2>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Campaign</th>
										<th>Status</th>
										<th>Signups</th>
										<th>Registrations</th>
										<th>Exams completed</th>
										<th>Completion rate</th>
									</tr>
								</thead>
								<tbody>
									{studentCampaigns.map((campaign) => (
										<CampaignRow key={campaign.campaignId} campaign={campaign} type="STUDENT" />
									))}
									{studentCampaigns.length === 0 ? (
										<tr>
											<td colSpan={6} className="muted">
												No student campaigns yet.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>

					<div className="card">
						<h2>School campaign breakdown</h2>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Campaign</th>
										<th>Status</th>
										<th>Schools onboarded</th>
										<th>Approved schools</th>
									</tr>
								</thead>
								<tbody>
									{schoolCampaigns.map((campaign) => {
										const matched = schoolsForCode(campaign.code);
										return (
											<tr key={campaign.campaignId}>
												<td>{campaign.name.replace(/^\[(Student|School)\]\s*/i, "")}</td>
												<td>
													<StatusBadge status={campaign.status} />
												</td>
												<td>{matched.length}</td>
												<td>
													<span style={{ color: "var(--success-400)" }}>
														{matched.filter((s) => s.status === "APPROVED").length}
													</span>
												</td>
											</tr>
										);
									})}
									{schoolCampaigns.length === 0 ? (
										<tr>
											<td colSpan={4} className="muted">
												No school campaigns yet.
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

function CampaignRow({
	campaign,
	type,
}: {
	campaign: CampaignFunnelBreakdown;
	type: "STUDENT" | "SCHOOL";
}) {
	return (
		<tr>
			<td>{campaign.name.replace(/^\[(Student|School)\]\s*/i, "")}</td>
			<td>
				<StatusBadge status={campaign.status} />
			</td>
			{type === "STUDENT" ? (
				<>
					<td>{campaign.signups}</td>
					<td>{campaign.registrations}</td>
					<td>{campaign.paid}</td>
					<td>{formatRate(campaign.paid, campaign.signups)}</td>
				</>
			) : null}
		</tr>
	);
}

function formatRate(numerator: number, denominator: number): string {
	if (denominator === 0) return "—";
	return `${Math.round((numerator / denominator) * 100)}%`;
}
