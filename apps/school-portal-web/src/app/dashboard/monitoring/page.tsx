"use client";

import { useEffect } from "react";
import { portalApi } from "../../../lib/api-client";
import { useResource } from "../../../lib/use-resource";

const REFRESH_MS = 5000;

/** Live monitoring snapshot (§2.13) — near-real-time exam-day participation. */
export default function MonitoringPage() {
	const { data, loading, error, reload } = useResource(portalApi.monitoring);

	// Exam-day snapshot: poll every 5s. Read-only — a school watches, staff act.
	useEffect(() => {
		const id = setInterval(reload, REFRESH_MS);
		return () => clearInterval(id);
	}, [reload]);

	const tiles = [
		{ label: "In progress", value: data?.inProgress ?? 0 },
		{ label: "Submitted", value: data?.submitted ?? 0 },
		{ label: "Not started", value: data?.notStarted ?? 0 },
	];

	return (
		<main>
			<div className="page-header">
				<div className="row-between">
					<div>
						<h1>Live monitoring</h1>
						<p className="muted mb-0">Near-real-time snapshot of your students on exam day.</p>
					</div>
					<span className="badge badge--positive">● Live</span>
				</div>
			</div>

			{error && <div className="notice notice--error">{error}</div>}

			<div className="stat-row">
				{tiles.map((t) => (
					<div key={t.label} className="stat-tile">
						<span className="stat-tile__label">{t.label}</span>
						<span className="stat-tile__value">{loading && !data ? "…" : t.value}</span>
					</div>
				))}
			</div>

			<div className="card">
				<div className="section-title">
					<h2>Students sitting right now</h2>
					<span className="muted" style={{ fontSize: "0.85rem" }}>
						Auto-refreshes every 5s
					</span>
				</div>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Student</th>
								<th>Class</th>
								<th>Started</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{(data?.live ?? []).map((s) => (
								<tr key={s.attemptId}>
									<td>{s.name}</td>
									<td>Class {s.classBand}</td>
									<td className="muted">
										{s.startedAt
											? new Date(s.startedAt).toLocaleTimeString("en-IN", { timeStyle: "short" })
											: "—"}
									</td>
									<td>
										<span className="badge badge--pending">IN PROGRESS</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{data && data.live.length === 0 && (
					<div className="empty-state">
						<span className="empty-state__icon">📡</span>
						No students are sitting an exam right now.
					</div>
				)}
			</div>
		</main>
	);
}
