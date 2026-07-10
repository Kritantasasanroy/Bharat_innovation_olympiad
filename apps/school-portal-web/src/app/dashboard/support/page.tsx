"use client";

import { type FormEvent, useState } from "react";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SCHOOL_SUPPORT_EMAIL ?? "schools@bharatolympiad.in";

const CATEGORIES = ["Roster", "Scheduling", "Payments", "Results", "Technical", "Other"] as const;

/**
 * Helpdesk escalation (§2.22). There is no school-side ticketing backend, so
 * this composes a real email to the BIO team rather than pretending to persist a
 * ticket — the school portal is otherwise read-only.
 */
export default function SupportPage() {
	const [category, setCategory] = useState<string>(CATEGORIES[0]);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const mailSubject = encodeURIComponent(`[${category}] ${subject.trim() || "Support request"}`);
		const mailBody = encodeURIComponent(body.trim());
		window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${mailBody}`;
	}

	return (
		<main>
			<div className="page-header">
				<h1>Support</h1>
				<p className="muted">
					Reach the BIO team at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Use the
					form below to compose a message with the right subject line.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<h2>Contact the team</h2>
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
							placeholder="Short summary"
						/>
					</div>
					<div>
						<label htmlFor="body">How can we help?</label>
						<textarea
							id="body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							placeholder="Describe the issue…"
						/>
					</div>
					<button type="submit" className="button">
						Compose email
					</button>
				</form>
			</div>
		</main>
	);
}
