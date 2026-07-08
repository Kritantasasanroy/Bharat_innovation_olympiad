"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { SupportRequest, SupportRequestCategory } from "../../../lib/types";

const DISPUTE_EMAIL = process.env.NEXT_PUBLIC_PARTNER_SUPPORT_EMAIL ?? "partners@bio.example.com";

/**
 * Campaign/pricing support requests (PRD-011): submission + status only —
 * no ticket system, no admin reply thread. The dispute-contact requirement
 * is a plain `mailto:` link, not an in-portal thread.
 */
export default function SupportPage() {
	const { token } = useAuth();
	const [requests, setRequests] = useState<SupportRequest[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [category, setCategory] = useState<SupportRequestCategory>("CAMPAIGN");
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			setRequests(await portalApi.listSupportRequests(token));
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to load support requests.");
		}
	}, [token]);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !subject.trim() || !message.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			await portalApi.createSupportRequest(token, { category, subject, message });
			setSubject("");
			setMessage("");
			await load();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not submit the request.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Campaign & pricing support</h1>
				<p>Submit a request and track its status here. This is not a ticket system.</p>
			</div>

			{error ? <div className="notice notice--error">{error}</div> : null}

			<div className="card">
				<h2>New request</h2>
				<form className="form-grid" onSubmit={handleSubmit}>
					<div>
						<label htmlFor="category">Category</label>
						<select
							id="category"
							value={category}
							onChange={(event) => setCategory(event.target.value as SupportRequestCategory)}
						>
							<option value="CAMPAIGN">Campaign</option>
							<option value="PRICING">Pricing</option>
							<option value="OTHER">Other</option>
						</select>
					</div>
					<div>
						<label htmlFor="subject">Subject</label>
						<input
							id="subject"
							required
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
						/>
					</div>
					<div>
						<label htmlFor="message">Message</label>
						<textarea
							id="message"
							required
							value={message}
							onChange={(event) => setMessage(event.target.value)}
						/>
					</div>
					<button type="submit" className="button" disabled={submitting}>
						{submitting ? "Submitting…" : "Submit request"}
					</button>
				</form>
			</div>

			<div className="card">
				<h2>Your requests</h2>
				{requests ? (
					requests.length === 0 ? (
						<p className="muted">No requests yet.</p>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Subject</th>
										<th>Category</th>
										<th>Status</th>
										<th>Submitted</th>
									</tr>
								</thead>
								<tbody>
									{requests.map((request) => (
										<tr key={request.id}>
											<td>{request.subject}</td>
											<td>{request.category}</td>
											<td>
												<StatusBadge status={request.status} />
											</td>
											<td>{new Date(request.createdAt).toLocaleString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)
				) : !error ? (
					<p className="muted">Loading…</p>
				) : null}
			</div>

			<div className="card">
				<h2>Dispute a transaction or commission calculation?</h2>
				<p className="muted">
					For disputes, contact the BIO partnerships team directly — this is not handled through a
					form or ticket thread in this portal.
				</p>
				<a className="button button--secondary" href={`mailto:${DISPUTE_EMAIL}`}>
					Email {DISPUTE_EMAIL}
				</a>
			</div>
		</main>
	);
}
