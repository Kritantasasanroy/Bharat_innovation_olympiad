"use client";

import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";
import { students as initialStudents } from "../../../lib/school-data";
import type { SchoolStudent, StudentStatus } from "../../../lib/types";

type Filter = "ALL" | "INVITED" | "PARTICIPATING";

const STATUS_BADGE: Record<StudentStatus, string> = {
	INVITED: "badge",
	REGISTERED: "badge badge--pending",
	PAID: "badge badge--pending",
	SLOTTED: "badge badge--positive",
	COMPLETED: "badge badge--positive",
};

interface ParsedRow {
	name: string;
	classBand: string;
	email: string;
	valid: boolean;
	error?: string | undefined;
}

/** View Invited (§2.6) + Participating (§2.7) students + Bulk Upload (§2.8). */
export default function StudentsPage() {
	const [students, setStudents] = useState<SchoolStudent[]>(initialStudents);
	const [filter, setFilter] = useState<Filter>("ALL");
	const [query, setQuery] = useState("");
	const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
	const [dragActive, setDragActive] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);

	const visible = useMemo(() => {
		return students.filter((s) => {
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
				classNum >= 6 &&
				classNum <= 12 &&
				/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
			rows.push({
				name,
				classBand,
				email,
				valid,
				error: valid ? undefined : "Check name, class (6–12) and email",
			});
		}
		setParsed(rows);
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

	function importValid() {
		if (!parsed) return;
		const additions: SchoolStudent[] = parsed
			.filter((r) => r.valid)
			.map((r, i) => ({
				id: `stu_new_${Date.now()}_${i}`,
				name: r.name,
				classBand: Number(r.classBand),
				email: r.email,
				status: "INVITED",
				slotLabel: null,
				score: null,
			}));
		setStudents((prev) => [...additions, ...prev]);
		setParsed(null);
	}

	const validCount = parsed?.filter((r) => r.valid).length ?? 0;
	const invalidCount = (parsed?.length ?? 0) - validCount;

	return (
		<main>
			<div className="page-header">
				<h1>Students</h1>
				<p className="muted">Invited and participating students, plus bulk roster upload.</p>
			</div>

			<div className="card">
				<div className="section-title">
					<h2>Bulk student upload</h2>
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
				{/* biome-ignore lint/a11y: demo upload affordance; keyboard users use the button below */}
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
							{invalidCount > 0 ? <span className="badge badge--negative">{invalidCount} need fixing</span> : null}
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
										<tr key={`${r.email}-${i}`}>
											<td>{r.name}</td>
											<td>{r.classBand}</td>
											<td className="text-mono" style={{ fontSize: "0.8rem" }}>{r.email}</td>
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
							<button type="button" className="button" onClick={importValid} disabled={validCount === 0}>
								Import {validCount} student{validCount === 1 ? "" : "s"}
							</button>
							<button type="button" className="button button--secondary" onClick={() => setParsed(null)}>
								Cancel
							</button>
						</div>
					</div>
				) : null}
			</div>

			<div className="card">
				<div className="section-title">
					<h2>Roster ({visible.length})</h2>
					<input
						placeholder="Search name or email…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{ maxWidth: 260 }}
					/>
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
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Class</th>
								<th>Email</th>
								<th>Status</th>
								<th>Slot</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((s) => (
								<tr key={s.id}>
									<td>{s.name}</td>
									<td>Class {s.classBand}</td>
									<td className="text-mono" style={{ fontSize: "0.8rem" }}>{s.email}</td>
									<td>
										<span className={STATUS_BADGE[s.status]}>{s.status}</span>
									</td>
									<td className="muted">{s.slotLabel ?? "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{visible.length === 0 ? (
					<div className="empty-state">
						<span className="empty-state__icon">🔍</span>
						No students match this filter.
					</div>
				) : null}
			</div>
		</main>
	);
}
