"use client";

import { type FormEvent, useState } from "react";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useResource } from "../../../lib/use-resource";

/**
 * Institution profile — now **editable** (item 14), plus the school's partner
 * (item 10).
 *
 * What a coordinator can change is deliberately bounded. Board, UDISE code, city,
 * state and the coordinator's own name and phone are theirs. The school's **name,
 * pincode and code are not**: `(name, pincode)` is the directory's uniqueness key
 * and the code is what students type at registration, so a coordinator rewriting
 * either would collide with another school or break every student already pointing
 * at this one. Those stay a staff action, where the collision is visible. The
 * coordinator's email is likewise fixed — it is the identity the access token was
 * issued against.
 */
export default function ProfilePage() {
	const { token } = useAuth();
	const { data: profile, loading, error, reload } = useResource(portalApi.profile);
	const { data: partner } = useResource(portalApi.partner);

	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const field = (label: string, value: string | null | undefined) => (
		<div className="profile-field">
			<span className="profile-field__label">{label}</span>
			<span className="profile-field__value">{value || "—"}</span>
		</div>
	);

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token) return;
		const form = new FormData(event.currentTarget);

		setSaving(true);
		setSaveError(null);
		setNotice(null);

		try {
			await portalApi.updateProfile(token, {
				board: String(form.get("board") ?? ""),
				udiseCode: String(form.get("udiseCode") ?? ""),
				city: String(form.get("city") ?? ""),
				state: String(form.get("state") ?? ""),
				coordinatorName: String(form.get("coordinatorName") ?? ""),
				coordinatorPhone: String(form.get("coordinatorPhone") ?? ""),
			});
			setEditing(false);
			setNotice("Profile updated.");
			reload();
		} catch (err) {
			setSaveError(err instanceof ApiError ? err.message : "Could not save your changes.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Profile</h1>
				<p className="muted">
					Your institution and contact details. You can update your contact information here; the
					school name, pincode and code are set by the BIO team.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}
			{saveError && <div className="notice notice--error">{saveError}</div>}
			{notice && <div className="notice notice--positive">{notice}</div>}

			{loading && !profile && (
				<div className="card">
					<p className="muted mb-0">Loading…</p>
				</div>
			)}

			{profile && !editing && (
				<>
					<div className="card">
						<div className="section-title">
							<h2>Institution</h2>
							<div className="row" style={{ gap: "0.6rem", alignItems: "center" }}>
								<span
									className={
										profile.status === "ACTIVE" ? "badge badge--positive" : "badge badge--pending"
									}
								>
									{profile.status}
								</span>
								<button
									type="button"
									className="button button--secondary"
									onClick={() => {
										setEditing(true);
										setNotice(null);
									}}
								>
									Edit details
								</button>
							</div>
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

			{profile && editing && (
				<div className="card">
					<h2>Edit your details</h2>
					<form onSubmit={save}>
						<div className="grid-2">
							<label className="field">
								<span>Board</span>
								<input name="board" defaultValue={profile.board ?? ""} placeholder="e.g. CBSE" />
							</label>
							<label className="field">
								<span>UDISE / school code</span>
								<input name="udiseCode" defaultValue={profile.udiseCode ?? ""} />
							</label>
							<label className="field">
								<span>City</span>
								<input name="city" defaultValue={profile.city} required />
							</label>
							<label className="field">
								<span>State</span>
								<input name="state" defaultValue={profile.state} required />
							</label>
							<label className="field">
								<span>Coordinator name</span>
								<input
									name="coordinatorName"
									defaultValue={profile.coordinator?.name ?? ""}
									required
								/>
							</label>
							<label className="field">
								<span>Coordinator phone</span>
								<input
									name="coordinatorPhone"
									defaultValue={profile.coordinator?.phone ?? ""}
									required
								/>
							</label>
						</div>

						<p className="muted" style={{ fontSize: "0.85rem" }}>
							The school name, pincode, code and coordinator email cannot be changed here — students
							register against them. Raise a support request to change those.
						</p>

						<div className="row" style={{ gap: "0.6rem", marginTop: "1rem" }}>
							<button type="submit" className="button" disabled={saving}>
								{saving ? "Saving…" : "Save changes"}
							</button>
							<button
								type="button"
								className="button button--secondary"
								onClick={() => {
									setEditing(false);
									setSaveError(null);
								}}
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Item 10: every school has a partner. A school with none of its own
			    reports to the house partner, so this card is never empty. */}
			{partner && (
				<div className="card">
					<div className="section-title">
						<h2>Your partner</h2>
						{partner.isDefault && <span className="badge badge--neutral">Direct</span>}
					</div>
					<p className="muted" style={{ marginTop: 0 }}>
						{partner.isDefault
							? "Your school is run directly by the Bharat Innovation Olympiad team. Contact them for anything about your exams, slots or results."
							: "Your school was onboarded by this partner. They can see your students and, once released, your results."}
					</p>
					<div className="profile-grid">
						{field("Relationship", partner.label)}
						{field("Organisation", partner.orgName)}
						{field("Contact", partner.contactPerson)}
						{field("Email", partner.email)}
						{field("Phone", partner.phone)}
					</div>
				</div>
			)}
		</main>
	);
}
