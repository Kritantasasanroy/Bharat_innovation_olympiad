"use client";

import { type FormEvent, useState } from "react";
import { ApiError, portalApi, type SupportTicket } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useResource } from "../../../lib/use-resource";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SCHOOL_SUPPORT_EMAIL ?? "schools@bharatolympiad.in";
const CATEGORIES = ["Roster", "Scheduling", "Payments", "Results", "Technical", "Other"] as const;

const STATUS_BADGE: Record<SupportTicket["status"], string> = {
	OPEN: "badge",
	IN_REVIEW: "badge badge--pending",
	RESOLVED: "badge badge--positive",
};

/**
 * Helpdesk (§2.22). A request is raised against the backend — persisted and
 * visible to admins, who reply here — with a `mailto:` shortcut as an
 * alternative. (Was previously mailto-only, so nothing reached the team.)
 */
export default function SupportPage() {
	const { token } = useAuth();
	const { data: tickets, loading, error, reload } = useResource(portalApi.listSupport);

	const [category, setCategory] = useState<string>(CATEGORIES[0]);
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !subject.trim() || !message.trim()) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			await portalApi.createSupport(token, {
				category,
				subject: subject.trim(),
				message: message.trim(),
			});
			setSubject("");
			setMessage("");
			reload();
		} catch (cause) {
			setSubmitError(cause instanceof ApiError ? cause.message : "Could not submit your request.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Support</h1>
				<p>
					Raise a request with the BIO team — it reaches an admin, who replies below. Prefer email?{" "}
					<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<h2>New request</h2>
				<form className="form-grid" onSubmit={submit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="category">Category</label>
						<select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
							{CATEGORIES.map((c) => (
								<option key={c}>{c}</option>
							))}
						</select>
					</div>
					<div>
						<label htmlFor="subject">Subject</label>
						<input
							id="subject"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							required
						/>
					</div>
					<div>
						<label htmlFor="message">How can we help?</label>
						<textarea
							id="message"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							required
						/>
					</div>
					{submitError ? <div className="notice notice--error">{submitError}</div> : null}
					<button type="submit" className="button" disabled={submitting}>
						{submitting ? "Submitting…" : "Submit request"}
					</button>
				</form>
			</div>

			<div className="card">
				<h2>Your requests</h2>
				{error ? <div className="notice notice--error">{error}</div> : null}
				{tickets && tickets.length > 0 ? (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Subject</th>
									<th>Category</th>
									<th>Status</th>
									<th>Response</th>
									<th>Raised</th>
								</tr>
							</thead>
							<tbody>
								{tickets.map((t) => (
									<tr key={t.id}>
										<td>{t.subject}</td>
										<td className="muted">{t.category}</td>
										<td>
											<span className={STATUS_BADGE[t.status]}>{t.status.replace("_", " ")}</span>
										</td>
										<td className="muted">{t.response ?? "—"}</td>
										<td className="muted">{new Date(t.createdAt).toLocaleDateString("en-IN")}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : !loading ? (
					<p className="muted mb-0">No requests yet.</p>
				) : null}
			</div>
		</main>
	);
}
