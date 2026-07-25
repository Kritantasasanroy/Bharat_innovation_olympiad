/**
 * Domain enums for the exam-window runtime.
 *
 * Values mirror the shared Postgres enum types (created originally by the
 * legacy Prisma schema) so this service reads/writes the same database as the
 * NestJS backend during the migration window.
 */

export const QuestionType = {
	MCQ: "MCQ",
	MULTI_SELECT: "MULTI_SELECT",
	TRUE_FALSE: "TRUE_FALSE",
	SHORT_ANSWER: "SHORT_ANSWER",
	NUMERIC: "NUMERIC",
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const Difficulty = {
	EASY: "EASY",
	MEDIUM: "MEDIUM",
	HARD: "HARD",
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const AttemptStatus = {
	NOT_STARTED: "NOT_STARTED",
	IN_PROGRESS: "IN_PROGRESS",
	SUBMITTED: "SUBMITTED",
	AUTO_SUBMITTED: "AUTO_SUBMITTED",
	EXPIRED: "EXPIRED",
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

export const BookingStatus = {
	PENDING: "PENDING",
	CONFIRMED: "CONFIRMED",
	CANCELLED: "CANCELLED",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const MediaType = {
	IMAGE: "IMAGE",
	VIDEO: "VIDEO",
	AUDIO: "AUDIO",
	DIAGRAM: "DIAGRAM",
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];
