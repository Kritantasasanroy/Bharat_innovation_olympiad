"use client";

import { useEffect, useState } from "react";
import { students } from "../../../lib/school-data";

/** Live Monitoring Snapshot (§2.13) — near-real-time exam-day participation. */
export default function MonitoringPage() {
	const slotted = students.filter((s) => s.status === "SLOTTED" || s.status === "COMPLETED");
	const [tick, setTick] = useState(0);
	const [live, setLive] = useState(true);

	useEffect(() => {
		if (!live) return;
		const id = setInterval(() => setTick((t) => t + 1), 5000);
		return () => clearInterval(id);
	}, [live]);

	// Deterministic-but-moving snapshot derived from the tick.
	const total = slotted.length;
	const inProgress = Math.max(0, Math.min(total, 14 + (tick % 5) - 2));
	const submitted = Math.min(total - inProgress, 20 + (tick % 3));
	const notStarted = Math.max(0, total - inProgress - submitted);
	const flagged = tick % 4 === 0 ? 1 : 0;

	const tiles = [
		{ label: "Expected", value: total, cls: "" },
		{ label: "In progress", value: inProgress, cls: "badge--pending" },
		{ label: "Submitted", value: submitted, cls: "badge--positive" },
		{ label: "Not started", value: notStarted, cls: "" },
	];

	return (
		<main>
			<div className="page-header">
				<div className="row-between">
					<div>
						<h1>Live monitoring</h1>
						<p className="muted mb-0">Near-real-time snapshot of your students on exam day.</p>
					</div>
					<div className="inline">
						<span className={live ? "badge badge--positive" : "badge"}>
							{live ? "● Live" : "Paused"}
						</span>
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={() => setLive((v) => !v)}
						>
							{live ? "Pause" : "Resume"}
						</button>
					</div>
				</div>
			</div>

			<div className="stat-row">
				{tiles.map((t) => (
					<div key={t.label} className="stat-tile">
						<span className="stat-tile__label">{t.label}</span>
						<span className="stat-tile__value">{t.value}</span>
					</div>
				))}
			</div>

			{flagged > 0 ? (
				<div className="notice notice--error">
					⚠ {flagged} session flagged for proctoring review — our team is looking into it.
				</div>
			) : null}

			<div className="card">
				<div className="section-title">
					<h2>Students in this exam</h2>
					<span className="muted" style={{ fontSize: "0.85rem" }}>Auto-refreshes every 5s</span>
				</div>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Student</th>
								<th>Class</th>
								<th>Slot</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{slotted.map((s, i) => {
								const status =
									i < inProgress ? "IN PROGRESS" : i < inProgress + submitted ? "SUBMITTED" : "NOT STARTED";
								return (
									<tr key={s.id}>
										<td>{s.name}</td>
										<td>Class {s.classBand}</td>
										<td className="muted">{s.slotLabel ?? "—"}</td>
										<td>
											<span
												className={
													status === "SUBMITTED"
														? "badge badge--positive"
														: status === "IN PROGRESS"
															? "badge badge--pending"
															: "badge"
												}
											>
												{status}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
		</main>
	);
}
