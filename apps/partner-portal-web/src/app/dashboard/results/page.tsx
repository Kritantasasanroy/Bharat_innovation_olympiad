"use client";

import { useCallback, useEffect, useState } from "react";
import {
	ApiError,
	type PartnerReleasedInstance,
	type PartnerResultRow,
	partnerPortalApi,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
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
						<button type="button" className="button" disabled={downloading} onClick={download}>
							{downloading ? "Building…" : "⬇ Download Excel"}
						</button>
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
					{!rows ? (
						<p className="muted mb-0">Loading results…</p>
					) : rows.length === 0 ? (
						<p className="muted mb-0">No students from your schools sat this exam.</p>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Rank</th>
										<th>Student</th>
										<th>School</th>
										<th>Class</th>
										<th>Score</th>
										<th>Normalized</th>
										<th>Percentile</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<tr key={`${row.email}-${row.examTitle}`}>
											<td>{row.rank ?? "—"}</td>
											<td>
												<strong>{row.studentName}</strong>
												<br />
												<span className="muted" style={{ fontSize: "0.85rem" }}>
													{row.email}
												</span>
											</td>
											<td>{row.schoolName}</td>
											<td>{row.classBand ?? "—"}</td>
											<td>
												{row.rawScore ?? "—"}
												<span className="muted">/{row.maxScore ?? "—"}</span>
											</td>
											{/* Normalization makes scores comparable across students who
											    sat different question sets — it is the number that ranks. */}
											<td>{pct(row.normalizedScore)}</td>
											<td>{pct(row.percentile)}</td>
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
