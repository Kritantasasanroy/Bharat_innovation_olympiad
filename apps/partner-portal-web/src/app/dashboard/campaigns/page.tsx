"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CopyField } from "../../../components/copy-field";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { CampaignFunnelBreakdown } from "../../../lib/types";

export default function CampaignsPage() {
	const { token } = useAuth();
	const [campaigns, setCampaigns] = useState<readonly CampaignFunnelBreakdown[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const funnel = await portalApi.getFunnel(token);
			setCampaigns(funnel.campaigns);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to load campaigns.");
		}
	}, [token]);

	useEffect(() => {
		void load();
	}, [load]);

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
				status: currentlyActive ? "PAUSED" : "ACTIVE",
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
								<CopyField label="Share link" value={campaign.shareUrl} />
								<div className="stat-row" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
									<div className="stat-tile">
										<span className="stat-tile__label">Leads</span>
										<span className="stat-tile__value">{campaign.leads}</span>
									</div>
									<div className="stat-tile">
										<span className="stat-tile__label">Signups</span>
										<span className="stat-tile__value">{campaign.signups}</span>
									</div>
									<div className="stat-tile">
										<span className="stat-tile__label">Paid</span>
										<span className="stat-tile__value">{campaign.paidConversions}</span>
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
