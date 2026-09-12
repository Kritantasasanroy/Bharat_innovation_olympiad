"use client";

import { useMemo, useState } from "react";
import { SchoolStepGuide } from "../../../components/step-guide";
import {
	type BoardSlot,
	type PortalStudent,
	portalApi,
	type SchoolCalendarDay,
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

/**
 * The calendar's column headings.
 *
 * Spelled out rather than `["S","M","T",…]` because Tuesday and Thursday both
 * start with T, and Sunday and Saturday both with S — so the initial alone
 * cannot identify a column.
 */
const WEEKDAY_COLUMNS = [
	{ name: "Sunday", initial: "S" },
	{ name: "Monday", initial: "M" },
	{ name: "Tuesday", initial: "T" },
	{ name: "Wednesday", initial: "W" },
	{ name: "Thursday", initial: "T" },
	{ name: "Friday", initial: "F" },
	{ name: "Saturday", initial: "S" },
] as const;

const STATUS_BADGE: Record<PortalStudent["status"], string> = {
	INVITED: "badge",
	REGISTERED: "badge badge--pending",
	PAID: "badge badge--pending",
	COMPLETED: "badge badge--positive",
};

export default function SlotsPage() {
	const { data: boards, loading: boardsLoading, error: boardsError } = useResource(portalApi.slots);
	const { data: students, loading: studentsLoading } = useResource(portalApi.students);
	const { data: calendar } = useResource(portalApi.slotCalendar);

	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [studentSearch, setStudentSearch] = useState("");
	const [selectedClass, setSelectedClass] = useState<string>("ALL");

	// Collect unique dates across all exam slots
	const datesWithSlots = useMemo(() => {
		const map = new Map<string, { dateStr: string; slotsCount: number; exams: string[] }>();
		for (const board of boards ?? []) {
			for (const slot of board.sittings) {
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
			for (const slot of board.sittings) {
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
				<h1>Exam Calendar</h1>
				<p className="muted">
					Where your participants have been scheduled. Each one is assigned a sitting automatically
					about two weeks after they register, so your school is spread across several dates rather
					than sitting together.
				</p>
			</div>

			<SchoolStepGuide defaultOpen={false} />

			{boardsError && <div className="notice notice--error">{boardsError}</div>}

			{boardsLoading && !boards && <div className="card">Loading exam calendar…</div>}

			{!boardsLoading && boards && boards.length === 0 && (
				<div className="card">
					<div className="empty-state">
						<span className="empty-state__icon">🗓️</span>
						None of your participants have been scheduled yet. Dates appear here as they are
						assigned.
					</div>
				</div>
			)}

			{calendar && calendar.length > 0 && (
				<MonthCalendar
					days={calendar}
					activeDate={activeDate}
					onSelect={(iso) => setSelectedDate(iso)}
				/>
			)}

			{/* ── Calendar Date Selector ── */}
			{datesWithSlots.length > 0 && (
				<div className="card" style={{ marginBottom: "1.5rem" }}>
					<div className="section-title">
						<h2>Exam Date Calendar</h2>
						<span className="muted" style={{ fontSize: "0.85rem" }}>
							Select a date to see who is sitting that day
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
										{meta.slotsCount} sitting{meta.slotsCount === 1 ? "" : "s"}
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
								The sittings your participants were placed in on this date
							</p>
						</div>
					</div>

					<div className="grid-3" style={{ gap: "1rem" }}>
						{slotsOnDate.map(({ board, slot }) => {
							return (
								<div
									key={slot.slotId}
									className="stat-tile"
									style={{
										background: "var(--bg-card)",
										borderColor: "var(--border-default)",
										borderWidth: 1,
									}}
								>
									<div className="row-between">
										<strong style={{ fontSize: "0.95rem" }}>{board.examTitle}</strong>
										{slot.hasEnded && <span className="badge badge--neutral">Sat</span>}
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
										<span className="muted">Your participants</span>
										<strong>{slot.students}</strong>
									</div>

									{board.awaitingSchedule > 0 && (
										<p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
											{board.awaitingSchedule} of your participants still have no date for this
											exam.
										</p>
									)}
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

/**
 * A month grid per month the school has participants sitting in, each day
 * showing that school's own head count.
 *
 * The strip of date cards below answers "which dates am I involved in?". This
 * answers the question a coordinator actually plans around -- how the term looks
 * -- which only a real calendar layout can show: two heavy Sundays in a row, or
 * a fortnight with nobody out, are shapes, not numbers in a list.
 *
 * Counts are the school's own. A coordinator reading "50/50 full" would learn
 * nothing about their own eighteen participants, so sitting capacity is
 * deliberately absent here.
 */
function MonthCalendar({
	days,
	activeDate,
	onSelect,
}: {
	days: SchoolCalendarDay[];
	activeDate: string | null;
	onSelect: (iso: string) => void;
}) {
	const byKey = useMemo(() => {
		const map = new Map<string, SchoolCalendarDay>();
		for (const d of days) map.set(dateKey(d.date), d);
		return map;
	}, [days]);

	const busiest = useMemo(() => days.reduce((max, d) => Math.max(max, d.students), 0), [days]);

	const months = useMemo(() => {
		const seen = new Map<string, { year: number; month: number }>();
		for (const d of days) {
			const [year, month] = dateKey(d.date).split("-").map(Number);
			if (year === undefined || month === undefined) continue;
			seen.set(`${year}-${month}`, { year, month: month - 1 });
		}
		return Array.from(seen.values()).sort((a, b) => a.year - b.year || a.month - b.month);
	}, [days]);

	const total = days.reduce((n, d) => n + d.students, 0);

	return (
		<div className="card" style={{ marginBottom: "1.5rem" }}>
			<div className="section-title">
				<h2>Your school month by month</h2>
				<span className="muted" style={{ fontSize: "0.85rem" }}>
					{total} participant{total === 1 ? "" : "s"} across {days.length} day
					{days.length === 1 ? "" : "s"}
				</span>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
					gap: "1.5rem",
				}}
			>
				{months.map(({ year, month }) => {
					const first = new Date(Date.UTC(year, month, 1));
					const leading = first.getUTCDay();
					const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
					// Every cell carries its own key, blanks included: a grid keyed by
					// array position would reuse a React element across two months
					// whose leading-blank counts happen to differ.
					const cells: { key: string; date: string | null }[] = [
						...Array.from({ length: leading }, (_, i) => ({
							key: `lead-${year}-${month}-${i}`,
							date: null,
						})),
						...Array.from({ length: daysInMonth }, (_, i) => {
							const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(
								2,
								"0",
							)}`;
							return { key: date, date };
						}),
					];

					return (
						<div key={`${year}-${month}`}>
							<h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.6rem" }}>
								{first.toLocaleDateString("en-IN", {
									month: "long",
									year: "numeric",
									timeZone: "UTC",
								})}
							</h3>
							<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
								{WEEKDAY_COLUMNS.map(({ name, initial }) => (
									<div
										key={name}
										style={{
											textAlign: "center",
											fontSize: "0.68rem",
											fontWeight: 700,
											color: "var(--text-tertiary)",
											paddingBottom: 4,
										}}
									>
										{initial}
									</div>
								))}
								{cells.map((cell) => {
									if (!cell.date) return <div key={cell.key} />;
									const key = cell.date;
									const day = byKey.get(key);
									const number = Number(key.slice(-2));

									if (!day) {
										return (
											<div
												key={key}
												style={{
													aspectRatio: "1",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													fontSize: "0.72rem",
													color: "var(--text-tertiary)",
													opacity: 0.4,
												}}
											>
												{number}
											</div>
										);
									}

									// Shaded by head count relative to the school's own
									// busiest day, so the heavy dates stand out whether
									// the school sends six participants or six hundred.
									const weight = busiest > 0 ? day.students / busiest : 0;
									const isActive = activeDate === key;

									return (
										<button
											key={key}
											type="button"
											onClick={() => onSelect(key)}
											title={`${day.students} participant${
												day.students === 1 ? "" : "s"
											} on ${dateOnly(day.date)}`}
											style={{
												aspectRatio: "1",
												borderRadius: "var(--radius-sm, 6px)",
												border: isActive
													? "2px solid var(--accent-500, #4f9a12)"
													: "1px solid var(--border-default)",
												background: `rgba(79, 154, 18, ${0.12 + weight * 0.5})`,
												color: "var(--text-primary)",
												cursor: "pointer",
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												justifyContent: "center",
												gap: 1,
												padding: 2,
												opacity: day.hasEnded ? 0.55 : 1,
											}}
										>
											<span style={{ fontSize: "0.7rem" }}>{number}</span>
											<span style={{ fontSize: "0.8rem", fontWeight: 800 }}>{day.students}</span>
										</button>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>

			<div className="table-wrap" style={{ marginTop: "1.25rem" }}>
				<table className="data-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Participants</th>
							<th>Classes</th>
							<th>Exams</th>
						</tr>
					</thead>
					<tbody>
						{days.map((day) => (
							<tr
								key={day.date}
								style={{ opacity: day.hasEnded ? 0.6 : 1, cursor: "pointer" }}
								onClick={() => onSelect(dateKey(day.date))}
							>
								<td>
									<strong>{dateOnly(day.date)}</strong>
								</td>
								<td>{day.students}</td>
								<td style={{ fontSize: "0.85rem" }}>
									{day.byClassBand.map((b) => `Class ${b.classBand} (${b.students})`).join(", ")}
								</td>
								<td style={{ fontSize: "0.85rem" }}>{day.exams.map((e) => e.title).join(", ")}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
