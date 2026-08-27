"use client";

import { type FormEvent, useCallback, useState } from "react";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, partnerSupportApi, type SupportTicket } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { usePoll } from "../../../lib/use-poll";

const CATEGORIES = ["CAMPAIGN", "PRICING", "PAYOUT", "OTHER"] as const;

/**
 * Partner support tickets. These now go to the **backend** — persisted and
 * visible to admins on the admin Support page — replacing the earlier in-memory
 * portal-api store that reached no one. Admin responses appear here.
 */
export default function SupportPage() {
	const { token } = useAuth();
	const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [category, setCategory] = useState<string>("CAMPAIGN");
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const load = useCallback(async () => {
		if (!token) return;
		try {
			setTickets(await partnerSupportApi.list(token));
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load your support requests.");
		}
	}, [token]);

	usePoll(load);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !subject.trim() || !message.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			await partnerSupportApi.create(token, { category, subject, message });
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
				<h1>Support</h1>
				<p>Raise a request with the BIO team. It reaches an admin, who replies here.</p>
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
							onChange={(event) => setCategory(event.target.value)}
						>
							{CATEGORIES.map((c) => (
								<option key={c} value={c}>
									{c.charAt(0) + c.slice(1).toLowerCase()}
								</option>
							))}
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
				{tickets ? (
					tickets.length === 0 ? (
						<p className="muted">No requests yet.</p>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Subject</th>
										<th>Category</th>
										<th>Status</th>
										<th>Response</th>
										<th>Submitted</th>
									</tr>
								</thead>
								<tbody>
									{tickets.map((ticket) => (
										<tr key={ticket.id}>
											<td>{ticket.subject}</td>
											<td>{ticket.category}</td>
											<td>
												<StatusBadge status={ticket.status} />
											</td>
											<td className="muted">{ticket.response ?? "—"}</td>
											<td>{new Date(ticket.createdAt).toLocaleString()}</td>
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
		</main>
	);
}
