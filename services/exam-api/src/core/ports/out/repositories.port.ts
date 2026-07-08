import type {
	Attempt,
	AttemptItem,
	ExamInstanceView,
	ScoredQuestion,
	SectionWithPool,
} from "../../domain/models";

export interface NewAttempt {
	readonly id: string;
	readonly userId: string;
	readonly examInstanceId: string;
	readonly startedAt: Date;
	readonly ipAddress: string | null;
	readonly maxScore: number;
}

export interface NewAttemptItem {
	readonly questionId: string;
	readonly sortOrder: number;
}

/** Outbound port: persistence for attempts and their per-question items. */
export interface AttemptRepository {
	findByUserAndInstance(userId: string, examInstanceId: string): Promise<Attempt | null>;
	findById(id: string): Promise<Attempt | null>;
	/** Insert a fresh attempt, or re-activate an existing NOT_STARTED one (upsert on user+instance). */
	startAttempt(data: NewAttempt): Promise<Attempt>;
	finalize(
		id: string,
		status: Attempt["status"],
		submittedAt: Date,
		totalScore: number,
	): Promise<Attempt>;

	/** Re-open a finished attempt in place (demo exams allow unlimited retakes). */
	reopen(id: string, startedAt: Date, ipAddress: string | null): Promise<Attempt>;
	createItems(attemptId: string, items: readonly NewAttemptItem[]): Promise<void>;
	clearItems(attemptId: string): Promise<void>;
	findItems(attemptId: string): Promise<AttemptItem[]>;
	upsertAnswer(
		attemptId: string,
		questionId: string,
		answer: unknown,
		answeredAt: Date,
	): Promise<AttemptItem>;
	setItemScore(itemId: string, isCorrect: boolean, score: number): Promise<void>;
}

/**
 * Outbound port: read-only exam snapshot. `admin-api` owns authoring + answer
 * keys; this service reads the shared snapshot. Answer-key fields are only used
 * inside the domain (question-set build + scoring) and are stripped before the
 * HTTP boundary.
 */
export interface ExamSnapshotRepository {
	getInstance(instanceId: string): Promise<ExamInstanceView | null>;
	getSectionsWithPool(examId: string): Promise<SectionWithPool[]>;
	getScoredQuestionsByIds(ids: readonly string[]): Promise<Map<string, ScoredQuestion>>;
}
