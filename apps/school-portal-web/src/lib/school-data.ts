/**
 * School Portal data layer.
 *
 * The school-coordinator backend (PRD-047 / SCHOOL-01) is not built yet — the
 * legacy monolith only exposes ADMIN-scoped school endpoints (`GET /admin/schools`,
 * school-slot-assignments, reassignment). So this module returns representative
 * data so every feature page is fully navigable and demonstrable, and it is the
 * single seam to swap for real `fetch()` calls once the school API lands
 * (see NEXT_PUBLIC_API_URL). Nothing here is persisted server-side.
 */

import type {
	ClassPerformance,
	CustomWindowRequest,
	ExamWindow,
	PeerComparison,
	SchoolProfile,
	SchoolUser,
	SchoolStudent,
	SlotAllocation,
	SponsorshipRequest,
	StudentScore,
	SupportTicket,
} from "./types";

export const DEMO_MODE = true;

export const school: SchoolProfile = {
	id: "sch_demo_001",
	name: "Delhi Public School, Bengaluru East",
	code: "DPS-BLR-E",
	board: "CBSE",
	city: "Bengaluru",
	state: "Karnataka",
	contactName: "Anita Rao",
	contactEmail: "coordinator@dpsblre.edu.in",
	contactPhone: "+91 98450 12345",
	status: "ACTIVE",
};

export const schoolUsers: SchoolUser[] = [
	{ id: "u1", name: "Anita Rao", email: "coordinator@dpsblre.edu.in", role: "COORDINATOR" },
	{ id: "u2", name: "Vikram Nair", email: "reports@dpsblre.edu.in", role: "READ_ONLY" },
];

const FIRST = ["Aarav", "Diya", "Kabir", "Ananya", "Vivaan", "Isha", "Reyansh", "Myra", "Arjun", "Sara", "Advait", "Kiara", "Ishaan", "Aadhya", "Rudra", "Anvi", "Vihaan", "Pari", "Krish", "Navya"];
const LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Menon", "Rao", "Khan", "Bose", "Patel"];

const STATUSES: SchoolStudent["status"][] = ["INVITED", "REGISTERED", "PAID", "SLOTTED", "COMPLETED"];

export const students: SchoolStudent[] = Array.from({ length: 42 }, (_, i) => {
	const classBand = 6 + (i % 7);
	const status = STATUSES[Math.min(4, Math.floor((i * 5) / 42))] ?? "INVITED";
	const first = FIRST[i % FIRST.length] ?? "Student";
	const last = LAST[i % LAST.length] ?? "Kumar";
	const completed = status === "COMPLETED";
	return {
		id: `stu_${String(i + 1).padStart(3, "0")}`,
		name: `${first} ${last}`,
		classBand,
		email: `${first.toLowerCase()}.${last.toLowerCase()}@student.dpsblre.edu.in`,
		status,
		slotLabel: status === "SLOTTED" || completed ? `Batch ${1 + (i % 3)} · 10:00 AM` : null,
		score: completed ? 55 + ((i * 7) % 40) : null,
	};
});

export const examWindows: ExamWindow[] = [
	{ id: "win_1", examTitle: "National Science Olympiad 2026", startsAt: "2026-08-12T10:00:00", endsAt: "2026-08-12T12:00:00", capacity: 60, booked: 41, status: "OPEN" },
	{ id: "win_2", examTitle: "National Math Olympiad 2026", startsAt: "2026-08-19T10:00:00", endsAt: "2026-08-19T12:00:00", capacity: 60, booked: 60, status: "FULL" },
	{ id: "win_3", examTitle: "Innovation & Reasoning Challenge", startsAt: "2026-09-02T14:00:00", endsAt: "2026-09-02T16:00:00", capacity: 40, booked: 12, status: "OPEN" },
];

export const customWindowRequests: CustomWindowRequest[] = [
	{ id: "cwr_1", examTitle: "National Science Olympiad 2026", requestedStart: "2026-08-13T09:00:00", requestedEnd: "2026-08-13T11:00:00", reason: "School annual day clashes with the standard window.", status: "APPROVED" },
	{ id: "cwr_2", examTitle: "National Math Olympiad 2026", requestedStart: "2026-08-20T10:00:00", requestedEnd: "2026-08-20T12:00:00", reason: "Board practical exams on the default date.", status: "PENDING" },
];

export const slotAllocations: SlotAllocation[] = [
	{ slotId: "slot_1", label: "Batch 1 · 10:00 AM", startsAt: "2026-08-12T10:00:00", capacity: 20, booked: 20, classBands: [6, 7] },
	{ slotId: "slot_2", label: "Batch 2 · 11:30 AM", startsAt: "2026-08-12T11:30:00", capacity: 20, booked: 15, classBands: [8, 9, 10] },
	{ slotId: "slot_3", label: "Batch 3 · 01:00 PM", startsAt: "2026-08-12T13:00:00", capacity: 20, booked: 6, classBands: [11, 12] },
];

export const classPerformance: ClassPerformance[] = [6, 7, 8, 9, 10, 11, 12].map((classBand, i) => ({
	classBand,
	participants: 4 + ((i * 3) % 6),
	avgScore: 62 + ((i * 5) % 25),
	topScore: 84 + ((i * 3) % 15),
}));

export const studentScores: StudentScore[] = students
	.filter((s) => s.score !== null)
	.map((s, i) => ({
		id: s.id,
		name: s.name,
		classBand: s.classBand,
		score: s.score ?? 0,
		maxScore: 100,
		percentile: Math.max(40, 99 - i * 3),
		rank: i + 1,
	}));

export const peerComparison: PeerComparison[] = [
	{ metric: "Participation rate", thisSchool: 78, peerAverage: 64, unit: "%" },
	{ metric: "Average score", thisSchool: 71, peerAverage: 66, unit: "/100" },
	{ metric: "Top-10 percentile students", thisSchool: 9, peerAverage: 5, unit: "" },
	{ metric: "Completion rate", thisSchool: 94, peerAverage: 88, unit: "%" },
];

export const supportTickets: SupportTicket[] = [
	{ id: "tkt_1", subject: "Two students missing from invited list", category: "Roster", createdAt: "2026-07-01", status: "RESOLVED" },
	{ id: "tkt_2", subject: "Need extra slot for class 9", category: "Scheduling", createdAt: "2026-07-06", status: "IN_PROGRESS" },
];

export const sponsorshipRequests: SponsorshipRequest[] = [
	{ id: "spr_1", studentCount: 8, note: "Sponsorship for merit-list students from EWS category.", status: "APPROVED", createdAt: "2026-06-20" },
];

/** Participation summary rollup used on the overview + results pages. */
export function participationSummary() {
	const invited = students.length;
	const registered = students.filter((s) => s.status !== "INVITED").length;
	const paid = students.filter((s) => ["PAID", "SLOTTED", "COMPLETED"].includes(s.status)).length;
	const completed = students.filter((s) => s.status === "COMPLETED").length;
	return { invited, registered, paid, completed };
}
