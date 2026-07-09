"use client";

import { useState } from "react";
import {
	classPerformance,
	participationSummary,
	peerComparison,
	studentScores,
} from "../../../lib/school-data";

/**
 * Results & analytics — Results Available (§2.14), Participation Summary (§2.15),
 * Class/Grade Performance (§2.16), Student-wise Scores (§2.17), Percentile
 * Benchmarking (§2.18), School Comparison (§2.19), Export Reports (§2.20).
 */
export default function ResultsPage() {
	const summary = participationSummary();
	const [sortByScore, setSortByScore] = useState(true);

	const maxAvg = Math.max(...classPerformance.map((c) => c.avgScore), 1);
	const sortedScores = [...studentScores].sort((a, b) =>
		sortByScore ? b.score - a.score : a.classBand - b.classBand,
	);

	function exportCsv() {
		const header = "Name,Class,Score,Max,Percentile,Rank";
		const rows = studentScores.map(
			(s) => `${s.name},${s.classBand},${s.score},${s.maxScore},${s.percentile},${s.rank}`,
		);
		const csv = [header, ...rows].join("\n");
		const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
		const a = document.createElement("a");
		a.href = url;
		a.download = "bio-school-results.csv";
		a.click();
	}

	return (
		<main>
			<div className="page-header">
				<div className="row-between">
					<div>
						<h1>Results &amp; analytics</h1>
						<p className="muted mb-0">
							Released after fair-score processing (normalization) is complete.
						</p>
					</div>
					<button type="button" className="button button--secondary button--small" onClick={exportCsv}>
						⬇ Export reports (CSV)
					</button>
				</div>
			</div>

			{/* Participation summary */}
			<div className="stat-row">
				<div className="stat-tile">
					<span className="stat-tile__label">Invited</span>
					<span className="stat-tile__value">{summary.invited}</span>
				</div>
				<div className="stat-tile">
					<span className="stat-tile__label">Registered</span>
					<span className="stat-tile__value">{summary.registered}</span>
				</div>
				<div className="stat-tile">
					<span className="stat-tile__label">Completed</span>
					<span className="stat-tile__value">{summary.completed}</span>
				</div>
				<div className="stat-tile">
					<span className="stat-tile__label">Participation rate</span>
					<span className="stat-tile__value">
						{Math.round((summary.registered / summary.invited) * 100)}%
					</span>
				</div>
			</div>

			<div className="grid-2">
				{/* Class / grade performance */}
				<div className="card" style={{ marginBottom: 0 }}>
					<h2>Class / grade performance</h2>
					{classPerformance.map((c) => (
						<div key={c.classBand} className="perf-row">
							<span className="perf-row__label">
								Class {c.classBand} <span className="muted">· {c.participants}</span>
							</span>
							<div className="perf-bar">
								<div className="perf-bar__fill" style={{ width: `${(c.avgScore / maxAvg) * 100}%` }} />
							</div>
							<span className="perf-row__value">{c.avgScore}</span>
						</div>
					))}
					<p className="muted mb-0" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
						Bars show average score per class; count shown alongside.
					</p>
				</div>

				{/* School comparison / benchmarking */}
				<div className="card" style={{ marginBottom: 0 }}>
					<h2>School comparison</h2>
					<p className="muted" style={{ fontSize: "0.9rem" }}>
						Your school vs peer-school averages (fair, pre-defined rules).
					</p>
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Metric</th>
									<th className="text-right">You</th>
									<th className="text-right">Peers</th>
								</tr>
							</thead>
							<tbody>
								{peerComparison.map((p) => {
									const ahead = p.thisSchool >= p.peerAverage;
									return (
										<tr key={p.metric}>
											<td>{p.metric}</td>
											<td className="text-right">
												<span className={ahead ? "badge badge--positive" : "badge badge--pending"}>
													{p.thisSchool}
													{p.unit}
												</span>
											</td>
											<td className="text-right muted">
												{p.peerAverage}
												{p.unit}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Student-wise scores + percentile */}
			<div className="card">
				<div className="section-title">
					<h2>Student-wise scores &amp; percentile</h2>
					<div className="inline">
						<button
							type="button"
							className={sortByScore ? "pill pill--active" : "pill"}
							onClick={() => setSortByScore(true)}
						>
							By score
						</button>
						<button
							type="button"
							className={!sortByScore ? "pill pill--active" : "pill"}
							onClick={() => setSortByScore(false)}
						>
							By class
						</button>
					</div>
				</div>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Rank</th>
								<th>Student</th>
								<th>Class</th>
								<th className="text-right">Score</th>
								<th className="text-right">Percentile</th>
							</tr>
						</thead>
						<tbody>
							{sortedScores.map((s) => (
								<tr key={s.id}>
									<td>#{s.rank}</td>
									<td>{s.name}</td>
									<td>Class {s.classBand}</td>
									<td className="text-right">
										{s.score}
										<span className="muted">/{s.maxScore}</span>
									</td>
									<td className="text-right">
										<span className="badge badge--positive">{s.percentile}th</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</main>
	);
}
