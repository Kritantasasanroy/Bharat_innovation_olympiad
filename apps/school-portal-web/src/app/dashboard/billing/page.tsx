"use client";

import { type FormEvent, useState } from "react";
import { sponsorshipRequests as initialRequests } from "../../../lib/school-data";
import type { SponsorshipRequest } from "../../../lib/types";

/** Sponsored / Future Payments (§2.21). */
export default function BillingPage() {
	const [requests, setRequests] = useState<SponsorshipRequest[]>(initialRequests);
	const [count, setCount] = useState("");
	const [note, setNote] = useState("");

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const n = Number(count);
		if (!n || n < 1 || !note.trim()) return;
		setRequests((prev) => [
			{
				id: `spr_${Date.now()}`,
				studentCount: n,
				note: note.trim(),
				status: "REQUESTED",
				createdAt: new Date().toISOString().slice(0, 10),
			},
			...prev,
		]);
		setCount("");
		setNote("");
	}

	return (
		<main>
			<div className="page-header">
				<h1>Sponsorship &amp; future payments</h1>
				<p className="muted">
					Request a sponsored or future-payment arrangement for your students, for example a school
					or CSR-funded batch, or deferred billing.
				</p>
			</div>

			<div className="grid-2">
				<div className="card" style={{ marginBottom: 0 }}>
					<h2>New request</h2>
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
							Submit request
						</button>
					</form>
				</div>

				<div className="card" style={{ marginBottom: 0 }}>
					<h2>Your requests</h2>
					<div className="stack">
						{requests.map((r) => (
							<div key={r.id} className="notice" style={{ marginBottom: 0 }}>
								<div className="row-between">
									<strong>{r.studentCount} students</strong>
									<span
										className={
											r.status === "APPROVED"
												? "badge badge--positive"
												: r.status === "DECLINED"
													? "badge badge--negative"
													: "badge badge--pending"
										}
									>
										{r.status}
									</span>
								</div>
								<p className="muted mb-0" style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
									{r.createdAt} — {r.note}
								</p>
							</div>
						))}
						{requests.length === 0 ? <p className="muted mb-0">No sponsorship requests yet.</p> : null}
					</div>
				</div>
			</div>
		</main>
	);
}
