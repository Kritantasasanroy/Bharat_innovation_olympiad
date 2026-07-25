"use client";

import { type FormEvent, useState } from "react";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SCHOOL_SUPPORT_EMAIL ?? "schools@bharatolympiad.in";

/**
 * Sponsored / future payments (§2.21). There is no billing backend for schools,
 * so a sponsorship enquiry composes an email to the BIO team rather than
 * pretending to persist a request.
 */
export default function BillingPage() {
	const [count, setCount] = useState("");
	const [note, setNote] = useState("");

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const subject = encodeURIComponent(`Sponsorship enquiry — ${count || "?"} students`);
		const body = encodeURIComponent(`Number of students: ${count}\n\nDetails:\n${note.trim()}`);
		window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
	}

	return (
		<main>
			<div className="page-header">
				<h1>Sponsorship &amp; future payments</h1>
				<p className="muted">
					Arranging a sponsored batch (CSR-funded, EWS, merit) or deferred billing? Send us the
					details and our team will set it up.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<h2>Sponsorship enquiry</h2>
				<form className="form-grid" onSubmit={submit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="count">Number of students</label>
						<input
							id="count"
							type="number"
							min={1}
							value={count}
							onChange={(e) => setCount(e.target.value)}
							placeholder="e.g. 10"
						/>
					</div>
					<div>
						<label htmlFor="note">Details</label>
						<textarea
							id="note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="Who is sponsoring, and any conditions (e.g. merit-list, EWS category, deferred payment date)."
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
