/** Domain types for the School Portal (PRD-047 / SCHOOL-01, portal features §2). */

export type SchoolRole = "COORDINATOR" | "READ_ONLY";

export interface SchoolProfile {
	readonly id: string;
	name: string;
	code: string;
	board: string;
	city: string;
	state: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	status: "ACTIVE" | "PENDING" | "INVITED";
}

export interface SchoolUser {
	readonly id: string;
	name: string;
	email: string;
	role: SchoolRole;
}

export type StudentStatus = "INVITED" | "REGISTERED" | "PAID" | "SLOTTED" | "COMPLETED";

export interface SchoolStudent {
	readonly id: string;
	name: string;
	classBand: number;
	email: string;
	status: StudentStatus;
	slotLabel: string | null;
	score: number | null;
}

export interface ExamWindow {
	readonly id: string;
	examTitle: string;
	startsAt: string;
	endsAt: string;
	capacity: number;
	booked: number;
	status: "OPEN" | "FULL" | "CLOSED";
}

export interface CustomWindowRequest {
	readonly id: string;
	examTitle: string;
	requestedStart: string;
	requestedEnd: string;
	reason: string;
	status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface SlotAllocation {
	readonly slotId: string;
	label: string;
	startsAt: string;
	capacity: number;
	booked: number;
	classBands: number[];
}

export interface ClassPerformance {
	classBand: number;
	participants: number;
	avgScore: number;
	topScore: number;
}

export interface StudentScore {
	readonly id: string;
	name: string;
	classBand: number;
	score: number;
	maxScore: number;
	percentile: number;
	rank: number;
}

export interface PeerComparison {
	metric: string;
	thisSchool: number;
	peerAverage: number;
	unit: string;
}

export interface SupportTicket {
	readonly id: string;
	subject: string;
	category: string;
	createdAt: string;
	status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
}

export interface SponsorshipRequest {
	readonly id: string;
	studentCount: number;
	note: string;
	status: "REQUESTED" | "APPROVED" | "DECLINED";
	createdAt: string;
}
