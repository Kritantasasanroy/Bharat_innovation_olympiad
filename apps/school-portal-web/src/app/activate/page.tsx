"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ApiError, backendApi } from "../../lib/api-client";

const BOARDS = ["CBSE", "ICSE", "State Board", "IB / Cambridge"] as const;

/**
 * School self-activation (features §2.1–2.2).
 *
 * Submits a real access request to the backend, which queues it for staff
 * review on the admin Access Requests page. Approval provisions the school and
 * issues a single access token, which staff hand over; the school then signs in
 * with it at `/login`. Nothing is granted here.
 */
export default function ActivatePage() {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<{ schoolName: string; coordinatorEmail: string } | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);

		const form = new FormData(event.currentTarget);
		const value = (name: string) => String(form.get(name) ?? "").trim();

		try {
			const result = await backendApi.apply({
				schoolName: value("schoolName"),
				board: value("board"),
				...(value("udiseCode") ? { udiseCode: value("udiseCode") } : {}),
				city: value("city"),
				state: value("state"),
				coordinatorName: value("coordinatorName"),
				coordinatorEmail: value("coordinatorEmail"),
				coordinatorPhone: value("coordinatorPhone"),
			});
			setDone(result);
		} catch (cause) {
			setError(
				cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	if (done) {
		return (
			<main className="page">
				<div className="card" style={{ maxWidth: 560, textAlign: "center" }}>
					<div className="empty-state__icon">📨</div>
					<h2>Request submitted</h2>
					<p className="muted mb-0">
						<strong>{done.schoolName}</strong> is now queued for review. Once BIO staff approve it,
						an access token will be sent to <strong>{done.coordinatorEmail}</strong>. Sign in with
						that token to open your school&apos;s dashboard.
					</p>
					<div className="divider" />
					<Link href="/login" className="button">
						I already have a token
					</Link>
				</div>
			</main>
		);
	}

	return (
		<main className="page">
			<div className="page-header">
				<h1>Activate your school</h1>
				<p>
					Tell us about your school. BIO staff review every request and issue an access token on
					approval.
				</p>
			</div>

			<div className="card" style={{ maxWidth: 620 }}>
				<form className="form-grid" onSubmit={handleSubmit} style={{ maxWidth: "none" }}>
					<div>
						<label htmlFor="schoolName">School name</label>
						<input
							id="schoolName"
							name="schoolName"
							placeholder="Delhi Public School, ..."
							required
						/>
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="board">Board</label>
							<select id="board" name="board" defaultValue="CBSE">
								{BOARDS.map((board) => (
									<option key={board}>{board}</option>
								))}
							</select>
						</div>
						<div>
							<label htmlFor="udiseCode">UDISE / school code</label>
							<input id="udiseCode" name="udiseCode" placeholder="Optional" />
						</div>
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="city">City</label>
							<input id="city" name="city" required />
						</div>
						<div>
							<label htmlFor="state">State</label>
							<input id="state" name="state" required />
						</div>
					</div>
					<div>
						<label htmlFor="coordinatorName">Coordinator name</label>
						<input id="coordinatorName" name="coordinatorName" required />
					</div>
					<div className="grid-2" style={{ gap: "1rem" }}>
						<div>
							<label htmlFor="coordinatorEmail">Coordinator email</label>
							<input id="coordinatorEmail" name="coordinatorEmail" type="email" required />
						</div>
						<div>
							<label htmlFor="coordinatorPhone">Coordinator phone</label>
							<input id="coordinatorPhone" name="coordinatorPhone" required />
						</div>
					</div>
					{error ? <div className="notice notice--error">{error}</div> : null}
					<button type="submit" className="button" disabled={submitting}>
						{submitting ? "Submitting…" : "Submit for activation"}
					</button>
				</form>
			</div>

			<p className="muted" style={{ marginTop: "1rem" }}>
				Already have an access token? <Link href="/login">Sign in</Link>.
			</p>
		</main>
	);
}
