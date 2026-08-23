"use client";

import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";
import {
	ApiError,
	type NewStudent,
	type PortalStudent,
	portalApi,
	type RegisterStudentsResult,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { downloadCsv } from "../../../lib/csv";
import { useResource } from "../../../lib/use-resource";

type Filter = "ALL" | "INVITED" | "PARTICIPATING";

const STATUS_BADGE: Record<PortalStudent["status"], string> = {
	INVITED: "badge",
	REGISTERED: "badge badge--pending",
	PAID: "badge badge--pending",
	COMPLETED: "badge badge--positive",
};

interface ParsedRow {
	name: string;
	classBand: string;
	email: string;
	valid: boolean;
	error?: string | undefined;
}

/**
 * View invited (§2.6) and participating (§2.7) students, plus bulk upload (§2.8).
 *
 * Registering students is the ONE thing a school may write. It creates each
 * student as an invited roster entry; the student claims the account by
 * registering with that email. Everything else on this portal is read-only.
 */
export default function StudentsPage() {
	const { token } = useAuth();
	const { data: students, loading, error, reload } = useResource(portalApi.students);

	const [filter, setFilter] = useState<Filter>("ALL");
	const [query, setQuery] = useState("");
	const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
	const [dragActive, setDragActive] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<RegisterStudentsResult | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const visible = useMemo(() => {
		return (students ?? []).filter((s) => {
			const matchesFilter =
				filter === "ALL" ||
				(filter === "INVITED" && s.status === "INVITED") ||
				(filter === "PARTICIPATING" && s.status !== "INVITED");
			const matchesQuery =
				!query ||
				s.name.toLowerCase().includes(query.toLowerCase()) ||
				s.email.toLowerCase().includes(query.toLowerCase());
			return matchesFilter && matchesQuery;
		});
	}, [students, filter, query]);

	function parseCsv(text: string) {
		const lines = text.trim().split(/\r?\n/).filter(Boolean);
		const rows: ParsedRow[] = [];
		for (const line of lines) {
			const cells = line.split(",").map((c) => c.trim());
			const first = (cells[0] ?? "").toLowerCase();
			if (first === "name" || first === "student name") continue; // header
			const name = cells[0] ?? "";
			const classBand = cells[1] ?? "";
			const email = cells[2] ?? "";
			const classNum = Number(classBand);
			const valid =
				name.length > 1 &&
				classNum >= 1 &&
				classNum <= 12 &&
				/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
			rows.push({
				name,
				classBand,
				email,
				valid,
				error: valid ? undefined : "Check name, class (1–12) and email",
			});
		}
		setParsed(rows);
		setResult(null);
		setSubmitError(null);
	}

	function onFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		file.text().then(parseCsv);
	}

	function onDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragActive(false);
		const file = event.dataTransfer.files?.[0];
		if (file) file.text().then(parseCsv);
	}

	async function importValid() {
		if (!parsed || !token) return;
		const payload: NewStudent[] = parsed
			.filter((r) => r.valid)
			.map((r) => ({ name: r.name, email: r.email, classBand: Number(r.classBand) }));
		if (!payload.length) return;

		setSubmitting(true);
		setSubmitError(null);
		try {
			const outcome = await portalApi.registerStudents(token, payload);
			setResult(outcome);
			setParsed(null);
			reload();
		} catch (cause) {
			setSubmitError(
				cause instanceof ApiError ? cause.message : "Could not register these students.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	const validCount = parsed?.filter((r) => r.valid).length ?? 0;
	const invalidCount = (parsed?.length ?? 0) - validCount;

	function exportCsv() {
		downloadCsv(
			"bio-students.csv",
			["Name", "Class", "Email", "Status", "Score"],
			visible.map((s) => [s.name, s.classBand, s.email, s.status, s.score ?? "—"]),
		);
	}

	return (
		<main>
			<div className="page-header">
				<h1>Students</h1>
				<p className="muted">
					Invite students to your school, and track how far each has got. Invited students claim
					their account by registering with the same email.
				</p>
			</div>

			{result && (
				<div className="notice notice--success" style={{ marginBottom: "1rem" }}>
					Added {result.added} student{result.added === 1 ? "" : "s"}.
					{result.skipped.length > 0 && (
						<>
							{" "}
							{result.skipped.length} skipped —{" "}
							{result.skipped.map((s) => `${s.email} (${s.reason})`).join("; ")}.
						</>
					)}
				</div>
			)}
			{submitError && (
				<div className="notice notice--error" style={{ marginBottom: "1rem" }}>
					{submitError}
				</div>
			)}

			<div className="card">
				<div className="section-title">
					<h2>Invite students</h2>
					<a
						className="button button--secondary button--small"
						href={
							"data:text/csv;charset=utf-8," +
							encodeURIComponent("Name,Class,Email\nAarav Sharma,7,aarav@student.edu.in\n")
						}
						download="bio-student-template.csv"
					>
						Download template
					</a>
				</div>
				{/* biome-ignore lint/a11y: upload affordance; keyboard users use the button below */}
				<div
					className={dragActive ? "drop-zone drop-zone--active" : "drop-zone"}
					onClick={() => fileInput.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setDragActive(true);
					}}
					onDragLeave={() => setDragActive(false)}
					onDrop={onDrop}
				>
					<span className="drop-zone__icon">📄</span>
					Drop a CSV here, or click to choose a file. Columns: <strong>Name, Class, Email</strong>.
					<input
						ref={fileInput}
						type="file"
						accept=".csv,text/csv"
						onChange={onFile}
						style={{ display: "none" }}
					/>
				</div>

				{parsed ? (
					<div className="mt-4">
						<div className="inline" style={{ marginBottom: "0.75rem" }}>
							<span className="badge badge--positive">{validCount} valid</span>
							{invalidCount > 0 ? (
								<span className="badge badge--negative">{invalidCount} need fixing</span>
							) : null}
						</div>
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Name</th>
										<th>Class</th>
										<th>Email</th>
										<th>Result</th>
									</tr>
								</thead>
								<tbody>
									{parsed.map((r, i) => (
										// A CSV can list the same email twice; the index disambiguates
										// the preview rows, which are transient and never reordered.
										// biome-ignore lint/suspicious/noArrayIndexKey: transient preview rows
										<tr key={`${r.email}-${i}`}>
											<td>{r.name}</td>
											<td>{r.classBand}</td>
											<td className="text-mono" style={{ fontSize: "0.8rem" }}>
												{r.email}
											</td>
											<td>
												{r.valid ? (
													<span className="badge badge--positive">OK</span>
												) : (
													<span className="badge badge--negative" title={r.error}>
														Fix
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="inline mt-4">
							<button
								type="button"
								className="button"
								onClick={importValid}
								disabled={validCount === 0 || submitting}
							>
								{submitting
									? "Inviting…"
									: `Invite ${validCount} student${validCount === 1 ? "" : "s"}`}
							</button>
							<button
								type="button"
								className="button button--secondary"
								onClick={() => setParsed(null)}
							>
								Cancel
							</button>
						</div>
					</div>
				) : null}
			</div>

			<div className="card">
				<div className="section-title">
					<h2>Roster ({visible.length})</h2>
					<div className="row" style={{ gap: "0.5rem" }}>
						<input
							placeholder="Search name or email…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							style={{ maxWidth: 220 }}
						/>
						<button
							type="button"
							className="button button--secondary button--small"
							onClick={exportCsv}
							disabled={visible.length === 0}
						>
							Download CSV
						</button>
					</div>
				</div>
				<div className="inline" style={{ marginBottom: "1rem" }}>
					{(["ALL", "INVITED", "PARTICIPATING"] as Filter[]).map((f) => (
						<button
							key={f}
							type="button"
							className={filter === f ? "pill pill--active" : "pill"}
							onClick={() => setFilter(f)}
						>
							{f === "ALL" ? "All" : f === "INVITED" ? "Invited" : "Participating"}
						</button>
					))}
				</div>

				{error && <div className="notice notice--error">{error}</div>}

				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Class</th>
								<th>Email</th>
								<th>Status</th>
								<th>Score</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((s) => (
								<tr key={s.id}>
									<td>{s.name}</td>
									<td>Class {s.classBand}</td>
									<td className="text-mono" style={{ fontSize: "0.8rem" }}>
										{s.email}
									</td>
									<td>
										<span className={STATUS_BADGE[s.status]}>{s.status}</span>
									</td>
									<td className="muted">{s.score ?? "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!loading && visible.length === 0 ? (
					<div className="empty-state">
						<span className="empty-state__icon">🧑‍🎓</span>
						{students && students.length === 0
							? "No students yet. Invite your first batch above."
							: "No students match this filter."}
					</div>
				) : null}
			</div>
		</main>
	);
}
