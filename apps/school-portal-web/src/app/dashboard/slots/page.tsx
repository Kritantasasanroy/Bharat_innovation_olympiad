"use client";

import { type FormEvent, useState } from "react";
import {
	customWindowRequests as initialRequests,
	examWindows,
	slotAllocations,
} from "../../../lib/school-data";
import type { CustomWindowRequest } from "../../../lib/types";

/**
 * Exam Slot Dates (§2.10) + Track Slot Allocation (§2.9) + Custom Window
 * Request (§2.11) + Updated Window Visibility (§2.12).
 */
export default function SlotsPage() {
	const [requests, setRequests] = useState<CustomWindowRequest[]>(initialRequests);
	const [examTitle, setExamTitle] = useState(examWindows[0]?.examTitle ?? "");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [reason, setReason] = useState("");

	function submitRequest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!start || !end || !reason.trim()) return;
		setRequests((prev) => [
			{
				id: `cwr_${Date.now()}`,
				examTitle,
				requestedStart: start,
				requestedEnd: end,
				reason: reason.trim(),
				status: "PENDING",
			},
			...prev,
		]);
		setStart("");
		setEnd("");
		setReason("");
	}

	return (
		<main>
			<div className="page-header">
				<h1>Slots &amp; windows</h1>
				<p className="muted">
					Set the exam dates available to your students, track how they&apos;re allocated to slots,
					and request a custom window if the standard one doesn&apos;t fit.
				</p>
			</div>

			<div className="card">
				<h2>Exam windows for your school</h2>
				<p className="muted" style={{ fontSize: "0.9rem" }}>
					These windows drive automatic slot allocation for your students.
				</p>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Exam</th>
								<th>Window</th>
								<th>Seats</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{examWindows.map((w) => (
								<tr key={w.id}>
									<td>{w.examTitle}</td>
									<td>
										{new Date(w.startsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
										{" – "}
										{new Date(w.endsAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}
									</td>
									<td>
										{w.booked}/{w.capacity}
									</td>
									<td>
										<span
											className={
												w.status === "FULL"
													? "badge badge--pending"
													: w.status === "CLOSED"
														? "badge badge--negative"
														: "badge badge--positive"
											}
										>
											{w.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="card">
				<h2>Slot allocation status</h2>
				<p className="muted" style={{ fontSize: "0.9rem" }}>
					How your students are being distributed across exam-day batches.
				</p>
				<div className="grid-3">
					{slotAllocations.map((s) => {
						const pct = Math.round((s.booked / s.capacity) * 100);
						return (
							<div key={s.slotId} className="stat-tile" style={{ background: "var(--bg-card)" }}>
								<span className="stat-tile__label">{s.label}</span>
								<div className="row-between" style={{ margin: "0.4rem 0 0.6rem" }}>
									<span style={{ fontSize: "1.4rem", fontWeight: 700 }}>
										{s.booked}
										<span className="muted" style={{ fontSize: "0.9rem" }}>/{s.capacity}</span>
									</span>
									<span className="muted" style={{ fontSize: "0.85rem" }}>{pct}% full</span>
								</div>
								<div className="perf-bar">
									<div className="perf-bar__fill" style={{ width: `${pct}%` }} />
								</div>
								<div className="inline" style={{ marginTop: "0.6rem" }}>
									{s.classBands.map((c) => (
										<span key={c} className="pill">Class {c}</span>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="grid-2">
				<div className="card" style={{ marginBottom: 0 }}>
					<h2>Request a custom window</h2>
					<form className="form-grid" onSubmit={submitRequest} style={{ maxWidth: "none" }}>
						<div>
							<label htmlFor="exam">Exam</label>
							<select id="exam" value={examTitle} onChange={(e) => setExamTitle(e.target.value)}>
								{examWindows.map((w) => (
									<option key={w.id}>{w.examTitle}</option>
								))}
							</select>
						</div>
						<div className="grid-2" style={{ gap: "1rem" }}>
							<div>
								<label htmlFor="start">Requested start</label>
								<input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
							</div>
							<div>
								<label htmlFor="end">Requested end</label>
								<input id="end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
							</div>
						</div>
						<div>
							<label htmlFor="reason">Reason</label>
							<textarea
								id="reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="Why does the standard window not work for your school?"
							/>
						</div>
						<button type="submit" className="button">
							Submit request
						</button>
					</form>
				</div>

				<div className="card" style={{ marginBottom: 0 }}>
					<h2>Your requests</h2>
					<p className="muted" style={{ fontSize: "0.9rem" }}>
						Approved windows appear here automatically once our team reviews them.
					</p>
					<div className="stack">
						{requests.map((r) => (
							<div key={r.id} className="notice" style={{ marginBottom: 0 }}>
								<div className="row-between">
									<strong>{r.examTitle}</strong>
									<span
										className={
											r.status === "APPROVED"
												? "badge badge--positive"
												: r.status === "REJECTED"
													? "badge badge--negative"
													: "badge badge--pending"
										}
									>
										{r.status}
									</span>
								</div>
								<p className="muted mb-0" style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
									{new Date(r.requestedStart).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} — {r.reason}
								</p>
							</div>
						))}
						{requests.length === 0 ? <p className="muted mb-0">No custom window requests yet.</p> : null}
					</div>
				</div>
			</div>
		</main>
	);
}
