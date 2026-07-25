"use client";

import { useCallback, useMemo, useState } from "react";
import {
	ApiError,
	type AssignedSchool,
	type PartnerStudent,
	partnerPortalApi,
} from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
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

export default function PartnerStudentsPage() {
	const { token } = useAuth();

	const [students, setStudents] = useState<PartnerStudent[] | null>(null);
	const [schools, setSchools] = useState<AssignedSchool[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [schoolFilter, setSchoolFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [query, setQuery] = useState("");

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

	const rows = useMemo(() => {
		const all = students ?? [];
		const needle = query.trim().toLowerCase();

		return all.filter((s) => {
			if (schoolFilter && s.schoolId !== schoolFilter) return false;
			if (statusFilter && s.status !== statusFilter) return false;
			if (
				needle &&
				!s.name.toLowerCase().includes(needle) &&
				!s.email.toLowerCase().includes(needle)
			) {
				return false;
			}
			return true;
		});
	}, [students, schoolFilter, statusFilter, query]);

	if (!token) return null;

	return (
		<main>
			<div className="page-header">
				<h1>Students</h1>
				<p className="muted">
					Every student across the schools assigned to you. Registration and payment status update
					as they progress.
				</p>
			</div>

			{error && <div className="notice notice--error">{error}</div>}

			<div className="card">
				<div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
					<input
						placeholder="Search by name or email…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{ flex: 1, minWidth: 220 }}
					/>
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
									<th>Student</th>
									<th>School</th>
									<th>Class</th>
									<th>Contact</th>
									<th>Status</th>
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
										<td>{student.classBand ?? "—"}</td>
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
