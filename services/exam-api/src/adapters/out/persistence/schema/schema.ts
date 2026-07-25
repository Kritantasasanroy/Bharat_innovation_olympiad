import {
	boolean,
	customType,
	doublePrecision,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the exam-window runtime.
 *
 * These tables intentionally mirror the shared Postgres database created by the
 * legacy Prisma schema (default naming: PascalCase tables, camelCase columns,
 * enum type names equal to the enum name). This lets exam-api read/write the
 * same Neon database as the NestJS backend during the migration window. Only the
 * columns this service touches are declared.
 *
 * NOTE: `String @id @default(uuid())` columns are `text` under Prisma defaults;
 * if the production schema pinned `@db.Uuid`, swap `text` -> `uuid` here.
 */

const bytea = customType<{ data: Buffer; notNull: false }>({
	dataType() {
		return "bytea";
	},
});

const ts = (name: string) => timestamp(name, { mode: "date", precision: 3 });

export const attemptStatus = pgEnum("AttemptStatus", [
	"NOT_STARTED",
	"IN_PROGRESS",
	"SUBMITTED",
	"AUTO_SUBMITTED",
	"EXPIRED",
]);
export const questionType = pgEnum("QuestionType", [
	"MCQ",
	"MULTI_SELECT",
	"TRUE_FALSE",
	"SHORT_ANSWER",
	"NUMERIC",
]);
export const difficulty = pgEnum("Difficulty", ["EASY", "MEDIUM", "HARD"]);
export const mediaType = pgEnum("MediaType", ["IMAGE", "VIDEO", "AUDIO", "DIAGRAM"]);
export const bookingStatus = pgEnum("BookingStatus", ["PENDING", "CONFIRMED", "CANCELLED"]);

export const users = pgTable("User", {
	id: text("id").primaryKey(),
	faceEmbedding: bytea("faceEmbedding"),
});

export const exams = pgTable("Exam", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	totalMarks: integer("totalMarks").notNull(),
	durationMinutes: integer("durationMinutes").notNull(),
	easyPct: integer("easyPct").notNull().default(30),
	mediumPct: integer("mediumPct").notNull().default(50),
	hardPct: integer("hardPct").notNull().default(20),
});

export const examSections = pgTable("ExamSection", {
	id: text("id").primaryKey(),
	examId: text("examId").notNull(),
	title: text("title").notNull(),
	sortOrder: integer("sortOrder").notNull().default(0),
	questionsToAssign: integer("questionsToAssign").notNull().default(0),
});

export const sectionQuestions = pgTable("SectionQuestion", {
	id: text("id").primaryKey(),
	sectionId: text("sectionId").notNull(),
	questionId: text("questionId").notNull(),
	sortOrder: integer("sortOrder").notNull().default(0),
});

export const questions = pgTable("Question", {
	id: text("id").primaryKey(),
	type: questionType("type").notNull(),
	difficulty: difficulty("difficulty").notNull(),
	text: text("text").notNull(),
	options: jsonb("options"),
	correctAnswer: text("correctAnswer"),
	marks: integer("marks").notNull().default(1),
	negativeMarks: doublePrecision("negativeMarks").notNull().default(0),
	timeLimitSecs: integer("timeLimitSecs"),
	mediaUrl: text("mediaUrl"),
	mediaType: mediaType("mediaType"),
	tags: text("tags").array().notNull().default([]),
	explanation: text("explanation"),
});

export const examInstances = pgTable("ExamInstance", {
	id: text("id").primaryKey(),
	examId: text("examId").notNull(),
	startsAt: ts("startsAt").notNull(),
	endsAt: ts("endsAt").notNull(),
	quitUrl: text("quitUrl"),
});

export const examSlots = pgTable("ExamSlot", {
	id: text("id").primaryKey(),
	examInstanceId: text("examInstanceId").notNull(),
	startsAt: ts("startsAt").notNull(),
	endsAt: ts("endsAt").notNull(),
	capacity: integer("capacity").notNull(),
	booked: integer("booked").notNull().default(0),
});

export const bookings = pgTable("Booking", {
	id: text("id").primaryKey(),
	userId: text("userId").notNull(),
	slotId: text("slotId").notNull(),
	status: bookingStatus("status").notNull(),
	createdAt: ts("createdAt").notNull().defaultNow(),
});

export const attempts = pgTable("Attempt", {
	id: text("id").primaryKey(),
	userId: text("userId").notNull(),
	examInstanceId: text("examInstanceId").notNull(),
	status: attemptStatus("status").notNull().default("NOT_STARTED"),
	startedAt: ts("startedAt"),
	submittedAt: ts("submittedAt"),
	totalScore: doublePrecision("totalScore"),
	maxScore: doublePrecision("maxScore"),
	ipAddress: text("ipAddress"),
	createdAt: ts("createdAt").notNull().defaultNow(),
});

export const attemptItems = pgTable("AttemptItem", {
	id: text("id").primaryKey(),
	attemptId: text("attemptId").notNull(),
	questionId: text("questionId").notNull(),
	answer: jsonb("answer"),
	isCorrect: boolean("isCorrect"),
	score: doublePrecision("score"),
	sortOrder: integer("sortOrder").notNull().default(0),
	answeredAt: ts("answeredAt"),
});
