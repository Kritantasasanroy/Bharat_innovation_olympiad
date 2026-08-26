"use client";

import { useCallback, useMemo, useState } from "react";
import {
	ApiError,
	type AssignedSchool,
	type PartnerStudent,
	partnerPortalApi,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { downloadCsv } from "../../../lib/csv";
import { usePoll } from "../../../lib/use-poll";

/**
 * Every student across every school assigned to this partner (item 9).
 *
 * Scope is derived server-side from the `partnerId` on the token, never from a
 * query parameter — the school filter below can only *narrow* what the partner
 * already owns, never widen it.
 */

const STATUS_TONE: Record<string, string> = {
	INVITED: "badge badge--pending",
	REGISTERED: "badge badge--neutral",
	PAID: "badge badge--positive",
	COMPLETED: "badge badge--positive",
};

const STATUS_WEIGHT: Record<string, number> = {
	COMPLETED: 4,
	PAID: 3,
	REGISTERED: 2,
	INVITED: 1,
};

type SortField = "class" | "status" | "name" | "school";
type SortOrder = "asc" | "desc";

export default function PartnerStudentsPage() {
	const { token } = useAuth();

	const [students, setStudents] = useState<PartnerStudent[] | null>(null);
	const [schools, setSchools] = useState<AssignedSchool[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [schoolFilter, setSchoolFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [classFilter, setClassFilter] = useState("");
	const [query, setQuery] = useState("");
	const [sortField, setSortField] = useState<SortField>("class");
	const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

	const load = useCallback(async () => {
		if (!token) return;
		try {
			const [s, sc] = await Promise.all([
				partnerPortalApi.students(token),
				partnerPortalApi.schools(token),
			]);
			setStudents(s);
			setSchools(sc);
			setError(null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load your students.");
		}
	}, [token]);

	usePoll(load);

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortOrder(sortOrder === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortOrder(field === "status" ? "desc" : "asc");
		}
	};

	const rows = useMemo(() => {
		const all = students ?? [];
		const needle = query.trim().toLowerCase();

		const filtered = all.filter((s) => {
			if (schoolFilter && s.schoolId !== schoolFilter) return false;
			if (statusFilter && s.status !== statusFilter) return false;
			if (classFilter && String(s.classBand) !== classFilter) return false;
			if (
				needle &&
				!s.name.toLowerCase().includes(needle) &&
				!s.email.toLowerCase().includes(needle) &&
				!s.schoolName.toLowerCase().includes(needle)
			) {
				return false;
			}
			return true;
		});

		return [...filtered].sort((a, b) => {
			let res = 0;
			if (sortField === "class") {
				res = (a.classBand ?? 0) - (b.classBand ?? 0);
			} else if (sortField === "status") {
				res = (STATUS_WEIGHT[a.status] ?? 0) - (STATUS_WEIGHT[b.status] ?? 0);
			} else if (sortField === "name") {
				res = a.name.localeCompare(b.name);
			} else if (sortField === "school") {
				res = a.schoolName.localeCompare(b.schoolName);
			}
			return sortOrder === "asc" ? res : -res;
		});
	}, [students, schoolFilter, statusFilter, classFilter, query, sortField, sortOrder]);

	if (!token) return null;

	function exportCsv() {
		downloadCsv(
			"bio-partner-students.csv",
			["Name", "Email", "Phone", "School", "School Code", "Class", "Status"],
			rows.map((s) => [
				s.name,
				s.email,
				s.phone ?? "—",
				s.schoolName,
				s.schoolCode ?? "—",
				s.classBand ?? "—",
				s.status,
			]),
		);
	}

	return (
		<main>
			<div className="page-header">
				<div className="row-between">
					<div>
						<h1>Students</h1>
						<p className="muted">
							Every student across the schools assigned to you. Registration and payment status
							update as they progress.
						</p>
					</div>
					<button
						type="button"
						className="button button--secondary button--small"
						onClick={exportCsv}
						disabled={rows.length === 0}
					>
						Download CSV
					</button>
				</div>
			</div>

			{error && <div className="notice notice--error">{error}</div>}

			<div className="card">
				<div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
					<input
						placeholder="Search by name, email, or school…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{ flex: 1, minWidth: 200 }}
					/>
					<select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
						<option value="">All Classes/Grades</option>
						{[6, 7, 8, 9, 10, 11, 12].map((cls) => (
							<option key={cls} value={String(cls)}>
								Class {cls}
							</option>
						))}
					</select>
					<select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
						<option value="">All schools</option>
						{(schools ?? []).map((school) => (
							<option key={school.id} value={school.id}>
								{school.name}
							</option>
						))}
					</select>
					<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
						<option value="">Any status</option>
						<option value="INVITED">Invited</option>
						<option value="REGISTERED">Registered</option>
						<option value="PAID">Paid</option>
						<option value="COMPLETED">Completed</option>
					</select>
					<select
						value={`${sortField}-${sortOrder}`}
						onChange={(e) => {
							const [f, o] = e.target.value.split("-") as [SortField, SortOrder];
							setSortField(f);
							setSortOrder(o);
						}}
					>
						<option value="class-asc">Sort: Grade (6 → 12)</option>
						<option value="class-desc">Sort: Grade (12 → 6)</option>
						<option value="status-desc">Sort: Exam Completed First</option>
						<option value="status-asc">Sort: Invited First</option>
						<option value="name-asc">Sort: Name (A → Z)</option>
						<option value="school-asc">Sort: School (A → Z)</option>
					</select>
				</div>

				<p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
					Showing {rows.length} of {(students ?? []).length} student
					{(students ?? []).length === 1 ? "" : "s"}.
				</p>
			</div>

			<div className="card">
				{!students ? (
					<p className="muted mb-0">Loading students…</p>
				) : rows.length === 0 ? (
					<div className="empty-state">
						<span className="empty-state__icon">🎓</span>
						{(students ?? []).length === 0
							? "No students yet. Once your schools add students to their rosters, they appear here."
							: "No students match those filters."}
					</div>
				) : (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th
										onClick={() => handleSort("name")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										Student {sortField === "name" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
									</th>
									<th
										onClick={() => handleSort("school")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										School {sortField === "school" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
									</th>
									<th
										onClick={() => handleSort("class")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										Class/Grade {sortField === "class" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
									</th>
									<th>Contact</th>
									<th
										onClick={() => handleSort("status")}
										style={{ cursor: "pointer", userSelect: "none" }}
									>
										Exam Status {sortField === "status" ? (sortOrder === "desc" ? "↓" : "↑") : ""}
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((student) => (
									<tr key={student.id}>
										<td>
											<strong>{student.name}</strong>
											<br />
											<span className="muted" style={{ fontSize: "0.85rem" }}>
												{student.email}
											</span>
										</td>
										<td>
											{student.schoolName}
											{student.schoolCode && (
												<>
													<br />
													<span className="muted" style={{ fontSize: "0.8rem" }}>
														{student.schoolCode}
													</span>
												</>
											)}
										</td>
										<td>
											{student.classBand ? (
												<span
													className="badge"
													style={{ background: "var(--bg-elevated)", fontWeight: 600 }}
												>
													Class {student.classBand}
												</span>
											) : (
												"—"
											)}
										</td>
										<td>{student.phone ?? "—"}</td>
										<td>
											<span className={STATUS_TONE[student.status] ?? "badge badge--neutral"}>
												{student.status}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</main>
	);
}
