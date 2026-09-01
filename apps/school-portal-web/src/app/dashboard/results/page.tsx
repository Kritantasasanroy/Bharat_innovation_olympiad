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

	const [sortKey, setSortKey] = useState<"score" | "class" | "percentile" | "rank" | "name">(
		"score",
	);
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const [classFilter, setClassFilter] = useState<string>("ALL");
	const [downloading, setDownloading] = useState<string | null>(null);
	const [downloadError, setDownloadError] = useState<string | null>(null);

	const rows = results ?? [];
	const instances = released ?? [];

	const handleSort = (key: "score" | "class" | "percentile" | "rank" | "name") => {
		if (sortKey === key) {
			setSortDir(sortDir === "asc" ? "desc" : "asc");
		} else {
			setSortKey(key);
			setSortDir(key === "class" || key === "rank" || key === "name" ? "asc" : "desc");
		}
	};

	const filteredRows = useMemo(() => {
		if (classFilter === "ALL") return rows;
		return rows.filter((r) => String(r.classBand) === classFilter);
	}, [rows, classFilter]);

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

	const sorted = useMemo(() => {
		return [...filteredRows].sort((a, b) => {
			let res = 0;
			if (sortKey === "score") {
				res = (a.normalizedScore ?? a.score ?? 0) - (b.normalizedScore ?? b.score ?? 0);
			} else if (sortKey === "class") {
				res = a.classBand - b.classBand;
			} else if (sortKey === "percentile") {
				res = (a.percentile ?? 0) - (b.percentile ?? 0);
			} else if (sortKey === "rank") {
				res = (a.rank ?? 999999) - (b.rank ?? 999999);
			} else if (sortKey === "name") {
				res = a.name.localeCompare(b.name);
			}
			return sortDir === "asc" ? res : -res;
		});
	}, [filteredRows, sortKey, sortDir]);

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
						No results released yet. They appear here once the Innovation Olympiad team publishes
						them.
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
				<div className="section-title" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
					<h2>Student-wise scores &amp; percentile ({sorted.length})</h2>
					<div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
						<select
							value={classFilter}
							onChange={(e) => setClassFilter(e.target.value)}
							style={{
								padding: "0.35rem 0.6rem",
								fontSize: "0.85rem",
								borderRadius: "var(--radius-sm)",
							}}
						>
							<option value="ALL">All Grades / Classes</option>
							{[6, 7, 8, 9, 10, 11, 12].map((cls) => (
								<option key={cls} value={String(cls)}>
									Class {cls}
								</option>
							))}
						</select>

						<select
							value={`${sortKey}-${sortDir}`}
							onChange={(e) => {
								const [k, d] = e.target.value.split("-") as [
									"score" | "class" | "percentile" | "rank" | "name",
									"asc" | "desc",
								];
								setSortKey(k);
								setSortDir(d);
							}}
							style={{
								padding: "0.35rem 0.6rem",
								fontSize: "0.85rem",
								borderRadius: "var(--radius-sm)",
							}}
						>
							<option value="score-desc">Sort: Score (High → Low)</option>
							<option value="score-asc">Sort: Score (Low → High)</option>
							<option value="class-asc">Sort: Grade (6 → 12)</option>
							<option value="class-desc">Sort: Grade (12 → 6)</option>
							<option value="percentile-desc">Sort: Percentile (High → Low)</option>
							<option value="rank-asc">Sort: Rank (Best #1 First)</option>
							<option value="name-asc">Sort: Name (A → Z)</option>
						</select>
					</div>
				</div>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th
									onClick={() => handleSort("rank")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Rank {sortKey === "rank" ? (sortDir === "asc" ? "↑" : "↓") : ""}
								</th>
								<th
									onClick={() => handleSort("name")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Student {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
								</th>
								<th
									onClick={() => handleSort("class")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Class/Grade {sortKey === "class" ? (sortDir === "asc" ? "↑" : "↓") : ""}
								</th>
								<th
									className="text-right"
									onClick={() => handleSort("score")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Score {sortKey === "score" ? (sortDir === "desc" ? "↓" : "↑") : ""}
								</th>
								<th
									className="text-right"
									onClick={() => handleSort("percentile")}
									style={{ cursor: "pointer", userSelect: "none" }}
								>
									Percentile {sortKey === "percentile" ? (sortDir === "desc" ? "↓" : "↑") : ""}
								</th>
							</tr>
						</thead>
						<tbody>
							{sorted.map((s) => (
								<tr key={s.studentId}>
									<td>{s.rank ? `#${s.rank}` : "—"}</td>
									<td>
										<strong>{s.name}</strong>
									</td>
									<td>
										<span
											className="badge"
											style={{ background: "var(--bg-elevated)", fontWeight: 600 }}
										>
											Class {s.classBand}
										</span>
									</td>
									<td className="text-right" style={{ fontWeight: 700 }}>
										{s.score ?? "—"}
										<span className="muted" style={{ fontWeight: 400 }}>
											/{s.totalMarks}
										</span>
									</td>
									<td className="text-right">
										{s.percentile != null ? (
											<span className="badge badge--positive">
												{Math.round(s.percentile)}th %ile
											</span>
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
