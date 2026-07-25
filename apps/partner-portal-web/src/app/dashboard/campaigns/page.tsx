"use client";

import { type FormEvent, useCallback, useState } from "react";
import { CopyField } from "../../../components/copy-field";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, type PartnerSchool, partnerSchoolApi, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { CampaignFunnelBreakdown } from "../../../lib/types";
import { usePoll } from "../../../lib/use-poll";

export default function CampaignsPage() {
	const { token } = useAuth();
	const [campaigns, setCampaigns] = useState<readonly CampaignFunnelBreakdown[] | null>(null);
	const [schools, setSchools] = useState<PartnerSchool[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			// Student conversions come from the funnel; school onboards are tracked
			// on the backend (SchoolRequest.submittedViaReferralCode), so merge both.
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
		try {
			await portalApi.createCampaign(token, { name: name.trim() });
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

	return (
		<main>
			<div className="page-header">
				<h1>Campaigns & referral links</h1>
				<p>Create a referral link/code for institutions and students to share.</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			<div className="card">
				<h2>New campaign</h2>
				<form
					className="form-grid"
					style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: "0.75rem" }}
					onSubmit={handleCreate}
				>
					<div style={{ flex: 1 }}>
						<label htmlFor="campaignName">Campaign name</label>
						<input
							id="campaignName"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. Autumn institution drive"
						/>
					</div>
					<button type="submit" className="button" disabled={creating}>
						{creating ? "Creating…" : "Create"}
					</button>
				</form>
			</div>

			<div className="card">
				<h2>Your campaigns</h2>
				{campaigns ? (
					campaigns.length === 0 ? (
						<p className="muted">No campaigns yet — create one above.</p>
					) : (
						campaigns.map((campaign) => (
							<div key={campaign.campaignId} className="card" style={{ marginBottom: "1rem" }}>
								<div className="top-bar">
									<div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
										<strong>{campaign.name}</strong>
										<StatusBadge status={campaign.status} />
									</div>
									<button
										type="button"
										className="button button--secondary button--small"
										disabled={busyCampaignId === campaign.campaignId}
										onClick={() => togglePause(campaign.campaignId, campaign.status === "ACTIVE")}
									>
										{campaign.status === "ACTIVE" ? "Pause" : "Resume"}
									</button>
								</div>
								<CopyField label="Code" value={campaign.code} />
								<CopyField label="Student link" value={campaign.shareUrl} />
								<p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
									A student who lands on this link and registers is credited to this campaign — and
									so is their payment.
								</p>
								<CopyField label="School onboarding link" value={campaign.schoolShareUrl} />
								<p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
									Send this to a school. A school that activates through it is attributed to you in
									the admin review queue.
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
										<span className="stat-tile__label">Paid</span>
										<span className="stat-tile__value">{campaign.paid}</span>
									</div>
									<div className="stat-tile">
										<span className="stat-tile__label">Schools onboarded</span>
										<span className="stat-tile__value">{schoolsForCode(campaign.code).total}</span>
										<span className="muted" style={{ fontSize: "0.72rem" }}>
											{schoolsForCode(campaign.code).approved} approved
										</span>
									</div>
								</div>
							</div>
						))
					)
				) : !error ? (
					<p className="muted">Loading…</p>
				) : null}
			</div>
		</main>
	);
}
