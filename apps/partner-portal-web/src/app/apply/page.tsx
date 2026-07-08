"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { StatusBadge } from "../../components/status-badge";
import { ApiError, portalApi } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import type { PartnerApplication } from "../../lib/types";

/**
 * Onboarding application (PRD-011): org name, contact person, email, phone —
 * deliberately no KYC/Aadhaar/document-upload fields. Shows the current
 * status (submitted/approved/rejected) once applied; the approval decision
 * itself is staff-only and made elsewhere (no review UI here).
 */
export default function ApplyPage() {
	const { token } = useAuth();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [application, setApplication] = useState<PartnerApplication | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({ orgName: "", contactPerson: "", email: "", phone: "" });

	const load = useCallback(async () => {
		if (!token) return;
		setLoading(true);
		try {
			const data = await portalApi.getMyApplication(token);
			setApplication(data);
			if (data.status === "APPROVED") router.replace("/dashboard");
		} catch (err) {
			if (err instanceof ApiError && err.statusCode === 404) {
				setApplication(null);
			} else if (err instanceof ApiError) {
				setError(err.message);
			}
		} finally {
			setLoading(false);
		}
	}, [token, router]);

	useEffect(() => {
		if (token === undefined) return;
		if (!token) {
			router.replace("/login");
			return;
		}
		void load();
	}, [token, router, load]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token) return;
		setSubmitting(true);
		setError(null);
		try {
			const created = await portalApi.submitApplication(token, form);
			setApplication(created);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not submit the application.");
		} finally {
			setSubmitting(false);
		}
	}

	if (loading) {
		return (
			<main className="page">
				<p className="muted">Loading…</p>
			</main>
		);
	}

	if (application) {
		return (
			<main className="page">
				<div className="page-header">
					<h1>Your partner application</h1>
				</div>
				<div className="card">
					<div className="top-bar">
						<h2 style={{ margin: 0 }}>{application.orgName}</h2>
						<StatusBadge status={application.status} />
					</div>
					<p className="muted">Submitted {new Date(application.submittedAt).toLocaleString()}</p>
					<table>
						<tbody>
							<tr>
								<th>Contact person</th>
								<td>{application.contactPerson}</td>
							</tr>
							<tr>
								<th>Email</th>
								<td>{application.email}</td>
							</tr>
							<tr>
								<th>Phone</th>
								<td>{application.phone}</td>
							</tr>
						</tbody>
					</table>
					{application.status === "SUBMITTED" ? (
						<p className="muted" style={{ marginTop: "1rem" }}>
							Your application is under review. This decision is made by the BIO team — there is no
							action for you to take here; check back for a status update.
						</p>
					) : null}
					{application.status === "REJECTED" ? (
						<p className="muted" style={{ marginTop: "1rem" }}>
							This application was not approved. Contact{" "}
							<a href="mailto:partners@bio.example.com">partners@bio.example.com</a> with any
							questions.
						</p>
					) : null}
				</div>
			</main>
		);
	}

	return (
		<main className="page">
			<div className="page-header">
				<h1>Apply as a channel partner</h1>
				<p>Org name, contact person, email, and phone — that&apos;s all we need to get started.</p>
			</div>
			<form className="form-grid" onSubmit={handleSubmit}>
				<div>
					<label htmlFor="orgName">Organisation name</label>
					<input
						id="orgName"
						required
						value={form.orgName}
						onChange={(event) => setForm({ ...form, orgName: event.target.value })}
					/>
				</div>
				<div>
					<label htmlFor="contactPerson">Contact person</label>
					<input
						id="contactPerson"
						required
						value={form.contactPerson}
						onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
					/>
				</div>
				<div>
					<label htmlFor="email">Email</label>
					<input
						id="email"
						type="email"
						required
						value={form.email}
						onChange={(event) => setForm({ ...form, email: event.target.value })}
					/>
				</div>
				<div>
					<label htmlFor="phone">Phone</label>
					<input
						id="phone"
						required
						value={form.phone}
						onChange={(event) => setForm({ ...form, phone: event.target.value })}
					/>
				</div>
				{error ? <div className="notice notice--error">{error}</div> : null}
				<button type="submit" className="button" disabled={submitting}>
					{submitting ? "Submitting…" : "Submit application"}
				</button>
			</form>
		</main>
	);
}
