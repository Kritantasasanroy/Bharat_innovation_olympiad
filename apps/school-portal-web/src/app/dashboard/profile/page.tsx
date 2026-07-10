"use client";

import { portalApi } from "../../../lib/api-client";
import { useResource } from "../../../lib/use-resource";

/**
 * Institution profile (§2.4), read-only. Built entirely from what the school
 * filled in when requesting access. A coordinator views it here; changing it is
 * a support request, not a self-serve edit (schools do not modify platform data).
 */
export default function ProfilePage() {
	const { data: profile, loading, error } = useResource(portalApi.profile);

	const field = (label: string, value: string | null | undefined) => (
		<div className="profile-field">
			<span className="profile-field__label">{label}</span>
			<span className="profile-field__value">{value || "—"}</span>
		</div>
	);

	return (
		<main>
			<div className="page-header">
				<h1>Profile</h1>
				<p className="muted">
					Your institution details, as submitted when you requested access. To change anything,
					contact the BIO team from the Support page.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}
			{loading && !profile && (
				<div className="card">
					<p className="muted mb-0">Loading…</p>
				</div>
			)}

			{profile && (
				<>
					<div className="card">
						<div className="section-title">
							<h2>Institution</h2>
							<span
								className={
									profile.status === "ACTIVE" ? "badge badge--positive" : "badge badge--pending"
								}
							>
								{profile.status}
							</span>
						</div>
						<div className="profile-grid">
							{field("School name", profile.name)}
							{field("School code", profile.code)}
							{field("Board", profile.board)}
							{field("UDISE / school code", profile.udiseCode)}
							{field("City", profile.city)}
							{field("State", profile.state)}
							{field("Pincode", profile.pincode)}
							{field(
								"Onboarded",
								profile.onboardedAt
									? new Date(profile.onboardedAt).toLocaleDateString("en-IN", {
											dateStyle: "medium",
										})
									: "—",
							)}
						</div>
					</div>

					{profile.coordinator && (
						<div className="card">
							<h2>Coordinator</h2>
							<div className="profile-grid">
								{field("Name", profile.coordinator.name)}
								{field("Email", profile.coordinator.email)}
								{field("Phone", profile.coordinator.phone)}
							</div>
						</div>
					)}
				</>
			)}
		</main>
	);
}
