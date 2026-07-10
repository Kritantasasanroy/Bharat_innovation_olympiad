"use client";

import { portalApi } from "../../../lib/api-client";
import { useResource } from "../../../lib/use-resource";

/**
 * Exam slot dates (§2.10) and slot-allocation status (§2.9), read-only.
 *
 * Slots are set by staff and filled by student registrations; a school views
 * where its students are placed but cannot change the allocation.
 */
export default function SlotsPage() {
	const { data: slots, loading, error } = useResource(portalApi.slots);

	return (
		<main>
			<div className="page-header">
				<h1>Slots &amp; windows</h1>
				<p className="muted">
					The exam windows your school is allocated, and how full each one is. Slots are set by the
					BIO team and fill as your students register.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}

			<div className="card">
				<h2>Your exam windows</h2>
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
							{(slots ?? []).map((w) => (
								<tr key={w.assignmentId}>
									<td>{w.examTitle}</td>
									<td>
										{new Date(w.startsAt).toLocaleString("en-IN", {
											dateStyle: "medium",
											timeStyle: "short",
										})}
										{" – "}
										{new Date(w.endsAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}
									</td>
									<td>
										{w.booked}/{w.capacity}
									</td>
									<td>
										<span
											className={
												w.status === "FULL" ? "badge badge--pending" : "badge badge--positive"
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
				{!loading && slots && slots.length === 0 && (
					<div className="empty-state">
						<span className="empty-state__icon">🗓️</span>
						No exam windows allocated yet. The BIO team assigns your slots once your school is set
						up.
					</div>
				)}
			</div>

			<div className="card">
				<h2>Slot allocation</h2>
				<p className="muted" style={{ fontSize: "0.9rem" }}>
					How full each of your allocated batches is.
				</p>
				<div className="grid-3">
					{(slots ?? []).map((s) => {
						const pct = s.capacity > 0 ? Math.round((s.booked / s.capacity) * 100) : 0;
						return (
							<div
								key={s.assignmentId}
								className="stat-tile"
								style={{ background: "var(--bg-card)" }}
							>
								<span className="stat-tile__label">{s.label ?? s.examTitle}</span>
								<div className="row-between" style={{ margin: "0.4rem 0 0.6rem" }}>
									<span style={{ fontSize: "1.4rem", fontWeight: 700 }}>
										{s.booked}
										<span className="muted" style={{ fontSize: "0.9rem" }}>
											/{s.capacity}
										</span>
									</span>
									<span className="muted" style={{ fontSize: "0.85rem" }}>
										{pct}% full
									</span>
								</div>
								<div className="perf-bar">
									<div className="perf-bar__fill" style={{ width: `${pct}%` }} />
								</div>
							</div>
						);
					})}
				</div>
				{!loading && slots && slots.length === 0 && (
					<p className="muted mb-0">Nothing to show yet.</p>
				)}
			</div>
		</main>
	);
}
