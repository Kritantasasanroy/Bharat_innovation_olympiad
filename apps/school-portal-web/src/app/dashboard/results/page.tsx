"use client";

import { useMemo, useState } from "react";
import { ApiError, type PortalResult, portalApi } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useResource } from "../../../lib/use-resource";

interface ClassRow {
	classBand: number;
	participants: number;
	avgScore: number;
}

function csvCell(value: string | number | null): string {
	return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

/**
 * Results & analytics — released results only (§2.14), participation summary
 * (§2.15), class/grade performance (§2.16), student-wise scores + percentile
 * (§2.17/§2.18), CSV export (§2.20). All read-only.
 *
 * The backend only returns attempts whose exam has been *released*, so a school
 * can never see scores before its students do.
 */
export default function ResultsPage() {
	const { token } = useAuth();
	const { data: results, loading, error } = useResource(portalApi.results);
	// Which exams have been released *to schools* — the Excel sheet is per exam.
	const { data: released } = useResource(portalApi.resultInstances);

	const [sortByScore, setSortByScore] = useState(true);
	const [downloading, setDownloading] = useState<string | null>(null);
	const [downloadError, setDownloadError] = useState<string | null>(null);

	const rows = results ?? [];
	const instances = released ?? [];

	/**
	 * Downloads the real `.xlsx` the backend builds — typed number cells, a frozen
	 * header, and the normalized score and percentile, which the flat CSV above
	 * does not carry. If several exams have been released, the most recent wins;
	 * the CSV remains for a quick, unformatted dump of what is on screen.
	 */
	async function downloadExcel() {
		const target = instances[0];
		if (!token || !target) return;

		setDownloading(target.examInstanceId);
		setDownloadError(null);
		try {
			await portalApi.downloadResults(token, target.examInstanceId, target.examTitle);
		} catch (err) {
			setDownloadError(
				err instanceof ApiError ? err.message : "Could not build the results sheet.",
			);
		} finally {
			setDownloading(null);
		}
	}

	const classPerformance = useMemo<ClassRow[]>(() => {
		const byClass = new Map<number, { total: number; count: number }>();
		for (const r of rows) {
			const bucket = byClass.get(r.classBand) ?? { total: 0, count: 0 };
			bucket.total += r.score ?? 0;
			bucket.count += 1;
			byClass.set(r.classBand, bucket);
		}
		return [...byClass.entries()]
			.map(([classBand, { total, count }]) => ({
				classBand,
				participants: count,
				avgScore: count ? Math.round(total / count) : 0,
			}))
			.sort((a, b) => a.classBand - b.classBand);
	}, [rows]);

	const maxAvg = Math.max(...classPerformance.map((c) => c.avgScore), 1);

	const sorted = useMemo(
		() =>
			[...rows].sort((a, b) =>
				sortByScore
					? (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0)
					: a.classBand - b.classBand,
			),
		[rows, sortByScore],
	);

	function exportCsv() {
		const header = "Name,Class,Exam,Score,Max,Percentile,Rank";
		const lines = rows.map((s: PortalResult) =>
			[s.name, s.classBand, s.examTitle, s.score, s.totalMarks, s.percentile, s.rank]
				.map(csvCell)
				.join(","),
		);
		const csv = [header, ...lines].join("\n");
		const a = document.createElement("a");
		a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
		a.download = "bio-school-results.csv";
		a.click();
	}

	if (!loading && rows.length === 0) {
		return (
			<main>
				<div className="page-header">
					<h1>Results &amp; analytics</h1>
					<p className="muted mb-0">
						Released after fair-score processing (normalization) is complete.
					</p>
				</div>
				{error && <div className="notice notice--error">{error}</div>}
				<div className="card">
					<div className="empty-state">
						<span className="empty-state__icon">📊</span>
						No results released yet. They appear here once the BIO team publishes them.
					</div>
				</div>
			</main>
		);
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
					<div className="row" style={{ gap: "0.5rem" }}>
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={exportCsv}
						>
							⬇ CSV
						</button>
						<button
							type="button"
							className="button button--small"
							disabled={downloading !== null || instances.length === 0}
							onClick={() => void downloadExcel()}
							title={
								instances.length === 0
									? "No released exams to download yet."
									: "Download the full result sheet as Excel"
							}
						>
							{downloading ? "Building…" : "⬇ Excel"}
						</button>
					</div>
				</div>

				{downloadError && <div className="notice notice--error">{downloadError}</div>}
			</div>

			<div className="card">
				<h2>Class / grade performance</h2>
				{classPerformance.map((c) => (
					<div key={c.classBand} className="perf-row">
						<span className="perf-row__label">
							Class {c.classBand} <span className="muted">· {c.participants}</span>
						</span>
						<div className="perf-bar">
							<div
								className="perf-bar__fill"
								style={{ width: `${(c.avgScore / maxAvg) * 100}%` }}
							/>
						</div>
						<span className="perf-row__value">{c.avgScore}</span>
					</div>
				))}
			</div>

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
							{sorted.map((s) => (
								<tr key={s.studentId}>
									<td>{s.rank ? `#${s.rank}` : "—"}</td>
									<td>{s.name}</td>
									<td>Class {s.classBand}</td>
									<td className="text-right">
										{s.score ?? "—"}
										<span className="muted">/{s.totalMarks}</span>
									</td>
									<td className="text-right">
										{s.percentile != null ? (
											<span className="badge badge--positive">{Math.round(s.percentile)}th</span>
										) : (
											"—"
										)}
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
