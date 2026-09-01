"use client";

import { type FormEvent, useState } from "react";
import { ApiError, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SCHOOL_SUPPORT_EMAIL ?? "schools@bharatolympiad.in";

export default function BillingPage() {
	const { token } = useAuth();
	const [count, setCount] = useState("");
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || !count || !note.trim()) {
			setError("Enter the number of students and tell us how the sponsorship should work.");
			return;
		}

		setSubmitting(true);
		setError(null);
		setSubmitted(false);
		try {
			await portalApi.createSupport(token, {
				category: "Payments",
				subject: `Sponsorship enquiry — ${count} students`,
				message: `Number of students: ${count}\n\nDetails:\n${note.trim()}`,
			});
			setCount("");
			setNote("");
			setSubmitted(true);
		} catch (cause) {
			setError(
				cause instanceof ApiError ? cause.message : "Could not send your sponsorship enquiry.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main>
			<div className="page-header">
				<h1>Sponsorship &amp; future payments</h1>
				<p className="muted">
					Request a sponsored batch, CSR-funded places, EWS support, merit sponsorship, or an
					approved deferred-payment arrangement. Your enquiry is saved as a support ticket for the
					Innovation Olympiad team.
				</p>
			</div>

			{error ? (
				<div className="notice notice--error" role="alert">
					{error}
				</div>
			) : null}
			{submitted ? (
				<div className="notice notice--success" role="status">
					Your sponsorship enquiry was sent to the Innovation Olympiad team. We will reply in the
					Support section.
				</div>
			) : null}

			<div className="card" style={{ maxWidth: 620 }}>
				<h2>Sponsorship enquiry</h2>
				<form className="form-grid" onSubmit={submit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="count">Number of students</label>
						<input
							id="count"
							type="number"
							min={1}
							max={5000}
							required
							value={count}
							onChange={(event) => setCount(event.target.value)}
							placeholder="e.g. 50"
						/>
					</div>
					<div>
						<label htmlFor="note">How should it work?</label>
						<textarea
							id="note"
							required
							maxLength={4000}
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Who is sponsoring, and any conditions such as merit list, EWS category, or a deferred payment date."
						/>
					</div>
					<button type="submit" className="button" disabled={submitting || !token}>
						{submitting ? "Sending…" : "Send enquiry"}
					</button>
				</form>
				<p className="muted" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
					Prefer email? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
				</p>
			</div>
		</main>
	);
}
