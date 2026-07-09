"use client";

import { type FormEvent, useState } from "react";
import { supportTickets as initialTickets } from "../../../lib/school-data";
import type { SupportTicket } from "../../../lib/types";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SCHOOL_SUPPORT_EMAIL ?? "schools@bharatolympiad.in";

const CATEGORIES = ["Roster", "Scheduling", "Payments", "Results", "Technical", "Other"] as const;

/** Helpdesk Escalation (§2.22). */
export default function SupportPage() {
	const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);
	const [subject, setSubject] = useState("");
	const [category, setCategory] = useState<string>(CATEGORIES[0]);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!subject.trim()) return;
		setTickets((prev) => [
			{
				id: `tkt_${Date.now()}`,
				subject: subject.trim(),
				category,
				createdAt: new Date().toISOString().slice(0, 10),
				status: "OPEN",
			},
			...prev,
		]);
		setSubject("");
	}

	return (
		<main>
			<div className="page-header">
				<h1>Support</h1>
				<p className="muted">
					Raise a helpdesk request, or reach our team directly at{" "}
					<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
				</p>
			</div>

			<div className="grid-2">
				<div className="card" style={{ marginBottom: 0 }}>
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
							<label htmlFor="subject">How can we help?</label>
							<textarea
								id="subject"
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								placeholder="Describe the issue…"
							/>
						</div>
						<div className="inline">
							<button type="submit" className="button">
								Submit request
							</button>
							<a className="button button--secondary" href={`mailto:${SUPPORT_EMAIL}`}>
								Email instead
							</a>
						</div>
					</form>
				</div>

				<div className="card" style={{ marginBottom: 0 }}>
					<h2>Your requests</h2>
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Subject</th>
									<th>Category</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{tickets.map((t) => (
									<tr key={t.id}>
										<td>{t.subject}</td>
										<td className="muted">{t.category}</td>
										<td>
											<span
												className={
													t.status === "RESOLVED"
														? "badge badge--positive"
														: t.status === "IN_PROGRESS"
															? "badge badge--pending"
															: "badge"
												}
											>
												{t.status.replace("_", " ")}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</main>
	);
}
