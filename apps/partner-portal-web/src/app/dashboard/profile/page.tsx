"use client";

import { type FormEvent, useCallback, useState } from "react";
import { ApiError, type PartnerProfile, partnerPortalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { usePoll } from "../../../lib/use-poll";

/**
 * The partner's own profile (item 14).
 *
 * A partner can change its organisation name, contact person and phone. It cannot
 * change its **email** — that is the identity its password and access token were
 * issued against, and moving it here would silently orphan the credential. Staff
 * can change it from the admin console. Status and commission rate are staff
 * decisions and are not fields on this form at all.
 */
export default function PartnerProfilePage() {
	const { token } = useAuth();

	const [profile, setProfile] = useState<PartnerProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			setProfile(await partnerPortalApi.profile(token));
			setError(null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load your profile.");
		}
	}, [token]);

	usePoll(load);

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token) return;
		const form = new FormData(event.currentTarget);

		setSaving(true);
		setError(null);
		setNotice(null);

		try {
			const updated = await partnerPortalApi.updateProfile(token, {
				orgName: String(form.get("orgName") ?? ""),
				contactPerson: String(form.get("contactPerson") ?? ""),
				phone: String(form.get("phone") ?? ""),
			});
			setProfile(updated);
			setNotice("Profile updated.");
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not save your changes.");
		} finally {
			setSaving(false);
		}
	}

	if (!token) return null;

	return (
		<main>
			<div className="page-header">
				<h1>Profile</h1>
				<p className="muted">
					Your organisation’s contact details. Schools you onboard see these, so keep them current.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}
			{notice && <div className="notice notice--positive">{notice}</div>}

			{!profile ? (
				<div className="card">
					<p className="muted mb-0">Loading…</p>
				</div>
			) : (
				<>
					<div className="card">
						<div className="section-title">
							<h2>Organisation</h2>
							<span
								className={
									profile.status === "APPROVED" ? "badge badge--positive" : "badge badge--pending"
								}
							>
								{profile.status}
							</span>
						</div>

						<form onSubmit={save}>
							<div className="grid-2">
								<label className="field">
									<span>Organisation name</span>
									<input name="orgName" defaultValue={profile.orgName} required />
								</label>
								<label className="field">
									<span>Contact person</span>
									<input name="contactPerson" defaultValue={profile.contactPerson} required />
								</label>
								<label className="field">
									<span>Phone</span>
									<input name="phone" defaultValue={profile.phone} required />
								</label>
								<label className="field">
									<span>Email</span>
									<input value={profile.email} disabled readOnly />
								</label>
							</div>

							<p className="muted" style={{ fontSize: "0.85rem" }}>
								Your email is your sign-in identity and cannot be changed here. Raise a support
								request if it needs to move.
							</p>

							<button type="submit" className="button" disabled={saving}>
								{saving ? "Saving…" : "Save changes"}
							</button>
						</form>
					</div>

					<div className="card">
						<h2>Partner ID</h2>
						<p className="muted" style={{ marginTop: 0 }}>
							Quote this when contacting the Innovation Olympiad team about your schools or payouts.
						</p>
						<code className="copy-field">{profile.partnerId ?? "Not yet provisioned"}</code>
					</div>
				</>
			)}
		</main>
	);
}
