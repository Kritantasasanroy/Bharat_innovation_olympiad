"use client";

import { useMemo, useState } from "react";
import { SchoolStepGuide } from "../../../components/step-guide";
import {
	type BoardSlot,
	type PortalStudent,
	portalApi,
	type SlotBoard,
} from "../../../lib/api-client";
import { downloadCsv } from "../../../lib/csv";
import { useResource } from "../../../lib/use-resource";

const dateOnly = (iso: string) =>
	new Date(iso).toLocaleDateString("en-IN", {
		weekday: "short",
		day: "2-digit",
		month: "short",
		year: "numeric",
	});

const dateKey = (iso: string) => new Date(iso).toISOString().split("T")[0] ?? "";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeStyle: "short" });

const STATUS_BADGE: Record<PortalStudent["status"], string> = {
	INVITED: "badge",
	REGISTERED: "badge badge--pending",
	PAID: "badge badge--pending",
	COMPLETED: "badge badge--positive",
};

export default function SlotsPage() {
	const { data: boards, loading: boardsLoading, error: boardsError } = useResource(portalApi.slots);
	const { data: students, loading: studentsLoading } = useResource(portalApi.students);

	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [studentSearch, setStudentSearch] = useState("");
	const [selectedClass, setSelectedClass] = useState<string>("ALL");

	// Collect unique dates across all exam slots
	const datesWithSlots = useMemo(() => {
		const map = new Map<string, { dateStr: string; slotsCount: number; exams: string[] }>();
		for (const board of boards ?? []) {
			for (const slot of board.slots) {
				const key = dateKey(slot.startsAt);
				const existing = map.get(key) ?? {
					dateStr: dateOnly(slot.startsAt),
					slotsCount: 0,
					exams: [],
				};
				existing.slotsCount += 1;
				if (!existing.exams.includes(board.examTitle)) {
					existing.exams.push(board.examTitle);
				}
				map.set(key, existing);
			}
		}
		const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		return sorted;
	}, [boards]);

	// Auto-select first date if none selected
	const activeDate = selectedDate ?? datesWithSlots[0]?.[0] ?? null;

	// Slots matching active date
	const slotsOnDate = useMemo(() => {
		if (!activeDate || !boards) return [];
		const list: { board: SlotBoard; slot: BoardSlot }[] = [];
		for (const board of boards) {
			for (const slot of board.slots) {
				if (dateKey(slot.startsAt) === activeDate) {
					list.push({ board, slot });
				}
			}
		}
		return list.sort(
			(a, b) => new Date(a.slot.startsAt).getTime() - new Date(b.slot.startsAt).getTime(),
		);
	}, [activeDate, boards]);

	// Eligible / scheduled students for the active date's exams
	const activeExamClassBands = useMemo(() => {
		const bands = new Set<number>();
		for (const { board } of slotsOnDate) {
			for (const c of board.classBands) bands.add(c);
		}
		return bands;
	}, [slotsOnDate]);

	const studentsForDate = useMemo(() => {
		if (!students || slotsOnDate.length === 0) return [];
		const needle = studentSearch.trim().toLowerCase();

		return students.filter((s) => {
			const isEligibleClass = activeExamClassBands.has(s.classBand);
			const matchesClass = selectedClass === "ALL" || String(s.classBand) === selectedClass;
			const matchesSearch =
				!needle || s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle);
			return isEligibleClass && matchesClass && matchesSearch;
		});
	}, [students, slotsOnDate, activeExamClassBands, selectedClass, studentSearch]);

	function exportDateSchedule() {
		if (!activeDate || studentsForDate.length === 0) return;
		const examsStr = slotsOnDate.map((s) => s.board.examTitle).join(", ");
		downloadCsv(
			`bio-schedule-${activeDate}.csv`,
			["Student Name", "Class", "Email", "Status", "Date", "Exams Scheduled"],
			studentsForDate.map((s) => [s.name, s.classBand, s.email, s.status, activeDate, examsStr]),
		);
	}

	return (
		<main>
			<div className="page-header">
				<h1>Exam Slots &amp; Calendar</h1>
				<p className="muted">
					View scheduled exam windows and the student cohort sitting on each date.
				</p>
			</div>

			<SchoolStepGuide defaultOpen={false} />

			{boardsError && <div className="notice notice--error">{boardsError}</div>}

			{boardsLoading && !boards && <div className="card">Loading exam calendar…</div>}

			{!boardsLoading && boards && boards.length === 0 && (
				<div className="card">
					<div className="empty-state">
						<span className="empty-state__icon">🗓️</span>
						No active exam instances scheduled right now. Upcoming exam slots will appear here when
						published.
					</div>
				</div>
			)}

			{/* ── Calendar Date Selector ── */}
			{datesWithSlots.length > 0 && (
				<div className="card" style={{ marginBottom: "1.5rem" }}>
					<div className="section-title">
						<h2>Exam Date Calendar</h2>
						<span className="muted" style={{ fontSize: "0.85rem" }}>
							Select a date to inspect scheduled slots &amp; students
						</span>
					</div>

					<div
						style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.5rem" }}
					>
						{datesWithSlots.map(([dateIso, meta]) => {
							const isSelected = activeDate === dateIso;
							const d = new Date(dateIso);
							return (
								<button
									key={dateIso}
									type="button"
									onClick={() => setSelectedDate(dateIso)}
									style={{
										padding: "0.75rem 1.1rem",
										borderRadius: "var(--radius-md)",
										border: isSelected
											? "2px solid var(--accent-500, #4f9a12)"
											: "1px solid var(--border-default)",
										background: isSelected ? "var(--bg-elevated)" : "var(--bg-card)",
										color: "var(--text-primary)",
										cursor: "pointer",
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										minWidth: 120,
										boxShadow: isSelected ? "var(--shadow-md)" : "none",
										transition: "all 0.15s ease",
									}}
								>
									<span
										style={{
											fontSize: "0.75rem",
											color: "var(--text-tertiary)",
											textTransform: "uppercase",
											fontWeight: 700,
										}}
									>
										{d.toLocaleDateString("en-IN", { weekday: "short" })}
									</span>
									<span style={{ fontSize: "1.25rem", fontWeight: 800, margin: "2px 0" }}>
										{d.getDate()} {d.toLocaleDateString("en-IN", { month: "short" })}
									</span>
									<span
										className="badge badge--neutral"
										style={{ fontSize: "0.7rem", marginTop: 4 }}
									>
										{meta.slotsCount} slot{meta.slotsCount === 1 ? "" : "s"}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* ── Exam Windows on Selected Date ── */}
			{activeDate && slotsOnDate.length > 0 && (
				<div className="card" style={{ marginBottom: "1.5rem" }}>
					<div className="section-title">
						<div>
							<h2>
								Exam Windows for{" "}
								{datesWithSlots.find(([k]) => k === activeDate)?.[1].dateStr || activeDate}
							</h2>
							<p className="muted mb-0" style={{ fontSize: "0.85rem" }}>
								Slots assigned for your school's classes
							</p>
						</div>
					</div>

					<div className="grid-3" style={{ gap: "1rem" }}>
						{slotsOnDate.map(({ board, slot }) => {
							const mine = slot.isAssignedToUs;
							return (
								<div
									key={slot.slotId}
									className="stat-tile"
									style={{
										background: "var(--bg-card)",
										borderColor: mine ? "var(--accent-500)" : "var(--border-default)",
										borderWidth: mine ? 2 : 1,
									}}
								>
									<div className="row-between">
										<strong style={{ fontSize: "0.95rem" }}>{board.examTitle}</strong>
										{mine && <span className="badge badge--positive">Your School Slot</span>}
									</div>

									<div className="muted" style={{ fontSize: "0.82rem", margin: "0.3rem 0" }}>
										Classes: {board.classBands.join(", ")} · {board.durationMinutes} mins
									</div>

									<p
										style={{
											margin: "0.4rem 0",
											fontWeight: 600,
											fontSize: "0.95rem",
											color: "var(--accent-500, #4f9a12)",
										}}
									>
										⏰ {time(slot.startsAt)} – {time(slot.endsAt)}
									</p>

									<div className="row-between" style={{ fontSize: "0.82rem", marginTop: "0.4rem" }}>
										<span className="muted">Booked / Capacity</span>
										<strong>
											{slot.booked} / {slot.capacity}
										</strong>
									</div>

									<div className="perf-bar" style={{ marginTop: "0.4rem" }}>
										<div className="perf-bar__fill" style={{ width: `${slot.fillPct}%` }} />
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* ── Student List on Selected Date ── */}
			{activeDate && (
				<div className="card">
					<div className="section-title" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
						<div>
							<h2>Students Scheduled ({studentsForDate.length})</h2>
							<p className="muted mb-0" style={{ fontSize: "0.82rem" }}>
								Students enrolled for exams scheduled on this date
							</p>
						</div>

						<div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
							<select
								value={selectedClass}
								onChange={(e) => setSelectedClass(e.target.value)}
								style={{
									padding: "0.35rem 0.6rem",
									fontSize: "0.85rem",
									borderRadius: "var(--radius-sm)",
								}}
							>
								<option value="ALL">All Eligible Classes</option>
								{[...activeExamClassBands]
									.sort((a, b) => a - b)
									.map((cls) => (
										<option key={cls} value={String(cls)}>
											Class {cls}
										</option>
									))}
							</select>

							<input
								placeholder="Search student name or email…"
								value={studentSearch}
								onChange={(e) => setStudentSearch(e.target.value)}
								style={{ maxWidth: 220, fontSize: "0.85rem" }}
							/>

							<button
								type="button"
								className="button button--secondary button--small"
								onClick={exportDateSchedule}
								disabled={studentsForDate.length === 0}
							>
								Download Date Schedule
							</button>
						</div>
					</div>

					{studentsLoading ? (
						<p className="muted mb-0">Loading student schedule…</p>
					) : studentsForDate.length === 0 ? (
						<div className="empty-state">
							<span className="empty-state__icon">🧑‍🎓</span>
							No students found for this date's exam classes. Check your student roster to invite
							more students.
						</div>
					) : (
						<div className="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Student Name</th>
										<th>Class / Grade</th>
										<th>Email</th>
										<th>Exams on this Date</th>
										<th>Registration Status</th>
									</tr>
								</thead>
								<tbody>
									{studentsForDate.map((s) => (
										<tr key={s.id}>
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
											<td className="text-mono" style={{ fontSize: "0.8rem" }}>
												{s.email}
											</td>
											<td>
												{slotsOnDate
													.filter((x) => x.board.classBands.includes(s.classBand))
													.map((x) => x.board.examTitle)
													.join(", ") || "Scheduled Cohort"}
											</td>
											<td>
												<span className={STATUS_BADGE[s.status]}>{s.status}</span>
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
