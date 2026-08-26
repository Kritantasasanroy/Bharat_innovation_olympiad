"use client";

import { type FormEvent, useCallback, useMemo, useState } from "react";
import { CopyField } from "../../../components/copy-field";
import { StatusBadge } from "../../../components/status-badge";
import { PartnerStepGuide } from "../../../components/step-guide";
import { ApiError, type PartnerSchool, partnerSchoolApi, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { CampaignFunnelBreakdown } from "../../../lib/types";
import { usePoll } from "../../../lib/use-poll";

type CampaignTypeFilter = "ALL" | "STUDENT" | "SCHOOL";

function getCampaignType(cName: string): "STUDENT" | "SCHOOL" {
	const lower = cName.toLowerCase();
	if (lower.startsWith("[school]") || lower.includes("school") || lower.includes("institution")) {
		return "SCHOOL";
	}
	return "STUDENT";
}

export default function CampaignsPage() {
	const { token } = useAuth();
	const [campaigns, setCampaigns] = useState<readonly CampaignFunnelBreakdown[] | null>(null);
	const [schools, setSchools] = useState<PartnerSchool[]>([]);
	const [error, setError] = useState<string | null>(null);

	const [name, setName] = useState("");
	const [targetType, setTargetType] = useState<"STUDENT" | "SCHOOL">("STUDENT");
	const [typeFilter, setTypeFilter] = useState<CampaignTypeFilter>("ALL");
	const [creating, setCreating] = useState(false);
	const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const [funnel, schoolList] = await Promise.all([
				portalApi.getFunnel(token),
				partnerSchoolApi.list(token),
			]);
			setCampaigns(funnel.campaigns);
			setSchools(schoolList);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to load campaigns.");
		}
	}, [token]);

	usePoll(load);

	/** Schools this campaign's link brought in, by status. */
	const schoolsForCode = (code: string) => {
		const matched = schools.filter((s) => s.submittedViaReferralCode === code);
		return {
			total: matched.length,
			approved: matched.filter((s) => s.status === "APPROVED").length,
		};
	};

	async function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !name.trim()) return;
		setCreating(true);
		setError(null);

		const prefixedName = name.trim().startsWith("[")
			? name.trim()
			: `[${targetType === "STUDENT" ? "Student" : "School"}] ${name.trim()}`;

		try {
			await portalApi.createCampaign(token, { name: prefixedName });
			setName("");
			await load();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not create the campaign.");
		} finally {
			setCreating(false);
		}
	}

	async function togglePause(campaignId: string, currentlyActive: boolean) {
		if (!token) return;
		setBusyCampaignId(campaignId);
		try {
			await portalApi.updateCampaign(token, campaignId, {
				status: currentlyActive ? "DEACTIVATED" : "ACTIVE",
			});
			await load();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not update the campaign.");
		} finally {
			setBusyCampaignId(null);
		}
	}

	const visibleCampaigns = useMemo(() => {
		if (!campaigns) return null;
		return campaigns.filter((c) => {
			if (typeFilter === "ALL") return true;
			return getCampaignType(c.name) === typeFilter;
		});
	}, [campaigns, typeFilter]);

	return (
		<main>
			<div className="page-header">
				<h1>Campaigns &amp; Referral Links</h1>
				<p>
					Create dedicated campaigns to onboard Students and Schools with individual referral
					tracking.
				</p>
			</div>

			<PartnerStepGuide defaultOpen={false} />

			{error ? <div className="notice notice--error">{error}</div> : null}

			{/* ── Create New Campaign with Dedicated Type ── */}
			<div className="card" style={{ marginBottom: "1.5rem" }}>
				<h2>Create New Campaign</h2>
				<form className="form-grid" onSubmit={handleCreate}>
					<div>
						<div style={{ fontWeight: 600, marginBottom: "0.4rem", display: "block" }}>
							Campaign Target Audience *
						</div>
						<div
							style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}
						>
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: "0.5rem",
									padding: "0.6rem 1rem",
									borderRadius: "var(--radius-sm)",
									border:
										targetType === "STUDENT"
											? "2px solid #3b82f6"
											: "1px solid var(--border-default)",
									background: targetType === "STUDENT" ? "rgba(59,130,246,0.08)" : "var(--bg-card)",
									cursor: "pointer",
								}}
							>
								<input
									type="radio"
									name="targetType"
									value="STUDENT"
									checked={targetType === "STUDENT"}
									onChange={() => setTargetType("STUDENT")}
								/>
								<div>
									<strong>Student Campaign</strong>
									<div className="muted" style={{ fontSize: "0.78rem" }}>
										Direct student &amp; parent registration link
									</div>
								</div>
							</label>

							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: "0.5rem",
									padding: "0.6rem 1rem",
									borderRadius: "var(--radius-sm)",
									border:
										targetType === "SCHOOL"
											? "2px solid #a855f7"
											: "1px solid var(--border-default)",
									background: targetType === "SCHOOL" ? "rgba(168,85,247,0.08)" : "var(--bg-card)",
									cursor: "pointer",
								}}
							>
								<input
									type="radio"
									name="targetType"
									value="SCHOOL"
									checked={targetType === "SCHOOL"}
									onChange={() => setTargetType("SCHOOL")}
								/>
								<div>
									<strong>School / Institution Campaign</strong>
									<div className="muted" style={{ fontSize: "0.78rem" }}>
										School portal onboarding &amp; activation link
									</div>
								</div>
							</label>
						</div>
					</div>

					<div
						style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
					>
						<div style={{ flex: 1, minWidth: 260 }}>
							<label htmlFor="campaignName">Campaign Name</label>
							<input
								id="campaignName"
								required
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder={
									targetType === "STUDENT"
										? "e.g. Nagpur High Schools Student Drive"
										: "e.g. Pune CBSE Schools Onboarding Q3"
								}
							/>
						</div>
						<button type="submit" className="button" disabled={creating || !name.trim()}>
							{creating
								? "Creating…"
								: `Create ${targetType === "STUDENT" ? "Student" : "School"} Campaign`}
						</button>
					</div>
				</form>
			</div>

			{/* ── Separate Campaign List with Tabs ── */}
			<div className="card">
				<div className="section-title" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
					<h2>Your Campaigns ({visibleCampaigns?.length ?? 0})</h2>
					<div className="inline">
						{(["ALL", "STUDENT", "SCHOOL"] as CampaignTypeFilter[]).map((t) => (
							<button
								key={t}
								type="button"
								className={typeFilter === t ? "pill pill--active" : "pill"}
								onClick={() => setTypeFilter(t)}
							>
								{t === "ALL"
									? "All Campaigns"
									: t === "STUDENT"
										? "Student Campaigns"
										: "School Campaigns"}
							</button>
						))}
					</div>
				</div>

				{visibleCampaigns ? (
					visibleCampaigns.length === 0 ? (
						<div className="empty-state">
							<span className="empty-state__icon">🎯</span>
							No {typeFilter !== "ALL" ? `${typeFilter.toLowerCase()} ` : ""}campaigns yet. Create
							one above to get your referral link.
						</div>
					) : (
						visibleCampaigns.map((campaign) => {
							const type = getCampaignType(campaign.name);
							const isStudentCampaign = type === "STUDENT";
							const isSchoolCampaign = type === "SCHOOL";
							const cleanName = campaign.name.replace(/^\[(Student|School)\]\s*/i, "");

							return (
								<div
									key={campaign.campaignId}
									className="card"
									style={{
										marginBottom: "1.25rem",
										borderLeft: `4px solid ${isStudentCampaign ? "#3b82f6" : "#a855f7"}`,
									}}
								>
									<div className="top-bar">
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: "0.6rem",
												flexWrap: "wrap",
											}}
										>
											<span
												className="badge"
												style={{
													background: isStudentCampaign
														? "rgba(59,130,246,0.15)"
														: "rgba(168,85,247,0.15)",
													color: isStudentCampaign ? "#3b82f6" : "#a855f7",
													fontWeight: 700,
												}}
											>
												{isStudentCampaign ? "🎓 Student Campaign" : "🏫 School Campaign"}
											</span>
											<strong style={{ fontSize: "1.05rem" }}>{cleanName}</strong>
											<StatusBadge status={campaign.status} />
										</div>
										<button
											type="button"
											className="button button--secondary button--small"
											disabled={busyCampaignId === campaign.campaignId}
											onClick={() => togglePause(campaign.campaignId, campaign.status === "ACTIVE")}
										>
											{campaign.status === "ACTIVE" ? "Pause Campaign" : "Resume Campaign"}
										</button>
									</div>

									<div style={{ marginTop: "0.75rem" }}>
										<CopyField label="Referral Code" value={campaign.code} />
									</div>

									{/* Dedicated Student Link Section */}
									{isStudentCampaign && (
										<div style={{ marginTop: "0.5rem" }}>
											<CopyField label="Student Registration Link" value={campaign.shareUrl} />
											<p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
												Share with students and parents. Any student who registers with this link is
												credited to this campaign.
											</p>
											<div className="stat-row" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
												<div className="stat-tile">
													<span className="stat-tile__label">Student signups</span>
													<span className="stat-tile__value">{campaign.signups}</span>
												</div>
												<div className="stat-tile">
													<span className="stat-tile__label">Registrations</span>
													<span className="stat-tile__value">{campaign.registrations}</span>
												</div>
												<div className="stat-tile">
													<span className="stat-tile__label">Paid pass holders</span>
													<span className="stat-tile__value">{campaign.paid}</span>
												</div>
											</div>
										</div>
									)}

									{/* Dedicated School Link Section */}
									{isSchoolCampaign && (
										<div style={{ marginTop: "0.5rem" }}>
											<CopyField
												label="School Onboarding & Activation Link"
												value={campaign.schoolShareUrl}
											/>
											<p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
												Send this to school principals or coordinators. Schools that activate
												through this link are tagged to you in the review queue.
											</p>
											<div className="stat-row" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
												<div className="stat-tile">
													<span className="stat-tile__label">Schools Onboarded</span>
													<span className="stat-tile__value">
														{schoolsForCode(campaign.code).total}
													</span>
												</div>
												<div className="stat-tile">
													<span className="stat-tile__label">Approved Schools</span>
													<span
														className="stat-tile__value"
														style={{ color: "var(--success-400)" }}
													>
														{schoolsForCode(campaign.code).approved}
													</span>
												</div>
											</div>
										</div>
									)}
								</div>
							);
						})
					)
				) : !error ? (
					<p className="muted">Loading campaigns…</p>
				) : null}
			</div>
		</main>
	);
}
