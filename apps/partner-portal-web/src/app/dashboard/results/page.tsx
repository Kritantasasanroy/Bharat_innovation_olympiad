"use client";

import { useCallback, useEffect, useState } from "react";
import {
	ApiError,
	type PartnerReleasedInstance,
	type PartnerResultRow,
	partnerPortalApi,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { downloadCsv } from "../../../lib/csv";
import { usePoll } from "../../../lib/use-poll";

/**
 * Results for the students of the schools assigned to this partner (item 17),
 * downloadable as an Excel sheet (item 16).
 *
 * A partner sees results only for exams an admin has explicitly released **to
 * partners** — a separate decision from releasing to students or to schools, and
 * one that may never be taken. So an empty page here is a normal state, not a
 * bug, and it says so.
 */

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}`);

export default function PartnerResultsPage() {
	const { token } = useAuth();

	const [instances, setInstances] = useState<PartnerReleasedInstance[] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [rows, setRows] = useState<PartnerResultRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [classFilter, setClassFilter] = useState<string>("ALL");
	const [sortKey, setSortKey] = useState<
		"rank" | "name" | "school" | "class" | "score" | "percentile"
	>("rank");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const list = await partnerPortalApi.releasedInstances(token);
			setInstances(list);
			setError(null);
			// Default to the most recent released exam.
			setSelected((current) => current ?? list[0]?.examInstanceId ?? null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load your results.");
		}
	}, [token]);

	usePoll(load);

	const handleSort = (key: "rank" | "name" | "school" | "class" | "score" | "percentile") => {
		if (sortKey === key) {
			setSortDir(sortDir === "asc" ? "desc" : "asc");
		} else {
			setSortKey(key);
			setSortDir(key === "score" || key === "percentile" ? "desc" : "asc");
		}
	};

	const sortedRows = (rows ?? [])
		.filter((r) => classFilter === "ALL" || String(r.classBand) === classFilter)
		.sort((a, b) => {
			let res = 0;
			if (sortKey === "rank") {
				res = (a.rank ?? 999999) - (b.rank ?? 999999);
			} else if (sortKey === "name") {
				res = a.studentName.localeCompare(b.studentName);
			} else if (sortKey === "school") {
				res = a.schoolName.localeCompare(b.schoolName);
			} else if (sortKey === "class") {
				res = (a.classBand ?? 0) - (b.classBand ?? 0);
			} else if (sortKey === "score") {
				res = (a.normalizedScore ?? a.rawScore ?? 0) - (b.normalizedScore ?? b.rawScore ?? 0);
			} else if (sortKey === "percentile") {
				res = (a.percentile ?? 0) - (b.percentile ?? 0);
			}
			return sortDir === "asc" ? res : -res;
		});

	// Load the rows for whichever exam is selected.
	useEffect(() => {
		if (!token || !selected) {
			setRows(null);
			return;
		}
		let cancelled = false;

		partnerPortalApi
			.results(token, selected)
			.then((data) => {
				if (!cancelled) setRows(data);
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof ApiError ? err.message : "Could not load those results.");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [token, selected]);

	const current = (instances ?? []).find((i) => i.examInstanceId === selected) ?? null;

	async function download() {
		if (!token || !current) return;
		setDownloading(true);
		setError(null);
		try {
			await partnerPortalApi.downloadResults(token, current.examInstanceId, current.examTitle);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not build the results sheet.");
		} finally {
			setDownloading(false);
		}
	}

	function exportCsv() {
		if (!current || !rows) return;
		downloadCsv(
			`bio-partner-results-${current.examTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
			[
				"Rank",
				"Student",
				"Email",
				"School",
				"School Code",
				"Class",
				"Score",
				"Max",
				"Normalized",
				"Percentile",
			],
			rows.map((r) => [
				r.rank ?? "—",
				r.studentName,
				r.email,
				r.schoolName,
				r.schoolCode,
				r.classBand ?? "—",
				r.rawScore ?? "—",
				r.maxScore ?? "—",
				r.normalizedScore ?? "—",
				r.percentile ?? "—",
			]),
		);
	}

	if (!token) return null;

	return (
		<main>
			<div className="page-header">
				<div className="row-between">
					<div>
						<h1>Results</h1>
						<p className="muted mb-0">
							Scores for students at the schools assigned to you, for exams the BIO team has
							released to partners.
						</p>
					</div>
					{current && (
						<div className="row" style={{ gap: "0.5rem" }}>
							<button
								type="button"
								className="button button--secondary"
								disabled={!rows || rows.length === 0}
								onClick={exportCsv}
							>
								Download CSV
							</button>
							<button type="button" className="button" disabled={downloading} onClick={download}>
								{downloading ? "Building…" : "Download Excel"}
							</button>
						</div>
					)}
				</div>
			</div>

			{error && <div className="notice notice--error">{error}</div>}

			{instances && instances.length === 0 && (
				<div className="card">
					<div className="empty-state">
						<span className="empty-state__icon">📊</span>
						No results have been released to you yet. Results are released per exam by the BIO team,
						after the exam closes and scores are normalized.
					</div>
				</div>
			)}

			{instances && instances.length > 0 && (
				<div className="card">
					<label className="field" style={{ maxWidth: 460 }}>
						<span>Exam</span>
						<select
							value={selected ?? ""}
							onChange={(e) => {
								setSelected(e.target.value);
								setRows(null);
							}}
						>
							{instances.map((instance) => (
								<option key={instance.examInstanceId} value={instance.examInstanceId}>
									{instance.examTitle} — {instance.students} student
									{instance.students === 1 ? "" : "s"}
								</option>
							))}
						</select>
					</label>

					{current && (
						<p className="muted" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
							Released to you on{" "}
							{new Date(current.releasedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}.
							Out of {current.totalMarks} marks.
						</p>
					)}
				</div>
			)}

			{current && (
				<div className="card">
					<div className="section-title" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
						<h2>Exam Results ({sortedRows.length})</h2>
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
										"rank" | "name" | "school" | "class" | "score" | "percentile",
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
								<option value="rank-asc">Sort: Rank (#1 Best First)</option>
								<option value="score-desc">Sort: Score (High → Low)</option>
								<option value="score-asc">Sort: Score (Low → High)</option>
								<option value="class-asc">Sort: Grade (6 → 12)</option>
								<option value="class-desc">Sort: Grade (12 → 6)</option>
								<option value="percentile-desc">Sort: Percentile (High → Low)</option>
								<option value="name-asc">Sort: Student Name (A → Z)</option>
								<option value="school-asc">Sort: School (A → Z)</option>
							</select>
						</div>
					</div>

					{!rows ? (
						<p className="muted mb-0">Loading results…</p>
					) : sortedRows.length === 0 ? (
						<p className="muted mb-0">No students match this filter.</p>
					) : (
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
											onClick={() => handleSort("school")}
											style={{ cursor: "pointer", userSelect: "none" }}
										>
											School {sortKey === "school" ? (sortDir === "asc" ? "↑" : "↓") : ""}
										</th>
										<th
											onClick={() => handleSort("class")}
											style={{ cursor: "pointer", userSelect: "none" }}
										>
											Class/Grade {sortKey === "class" ? (sortDir === "asc" ? "↑" : "↓") : ""}
										</th>
										<th
											onClick={() => handleSort("score")}
											style={{ cursor: "pointer", userSelect: "none" }}
										>
											Score {sortKey === "score" ? (sortDir === "desc" ? "↓" : "↑") : ""}
										</th>
										<th>Normalized</th>
										<th
											onClick={() => handleSort("percentile")}
											style={{ cursor: "pointer", userSelect: "none" }}
										>
											Percentile {sortKey === "percentile" ? (sortDir === "desc" ? "↓" : "↑") : ""}
										</th>
									</tr>
								</thead>
								<tbody>
									{sortedRows.map((row) => (
										<tr key={`${row.email}-${row.examTitle}`}>
											<td>{row.rank ? `#${row.rank}` : "—"}</td>
											<td>
												<strong>{row.studentName}</strong>
												<br />
												<span className="muted" style={{ fontSize: "0.85rem" }}>
													{row.email}
												</span>
											</td>
											<td>{row.schoolName}</td>
											<td>
												{row.classBand ? (
													<span
														className="badge"
														style={{ background: "var(--bg-elevated)", fontWeight: 600 }}
													>
														Class {row.classBand}
													</span>
												) : (
													"—"
												)}
											</td>
											<td>
												<strong>{row.rawScore ?? "—"}</strong>
												<span className="muted">/{row.maxScore ?? "—"}</span>
											</td>
											<td>{pct(row.normalizedScore)}</td>
											<td>
												{row.percentile != null ? (
													<span className="badge badge--positive">{pct(row.percentile)} %ile</span>
												) : (
													"—"
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</main>
	);
}
