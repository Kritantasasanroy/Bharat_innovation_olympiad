import type { AttemptStatus, Difficulty, MediaType, QuestionType } from "./enums";

/** Option shape stored on a question (answer key present only in ScoredQuestion). */
export interface QuestionOption {
	readonly id?: string;
	readonly text: string;
	readonly isCorrect?: boolean;
}

/**
 * Student-facing question view. Answer key fields (`correctAnswer`, option
 * `isCorrect`) are intentionally stripped before this crosses the HTTP boundary.
 */
export interface QuestionView {
	readonly id: string;
	readonly type: QuestionType;
	readonly difficulty: Difficulty;
	readonly text: string;
	readonly options: readonly { readonly id?: string | undefined; readonly text: string }[] | null;
	readonly marks: number;
	readonly negativeMarks: number;
	readonly timeLimitSecs: number | null;
	readonly mediaUrl: string | null;
	readonly mediaType: MediaType | null;
	readonly tags: readonly string[];
	readonly explanation: string | null;
}

/**
 * Full question with answer key — used only inside the domain for building the
 * question set and scoring. Never serialized to the student.
 */
export interface ScoredQuestion extends QuestionView {
	readonly options: readonly QuestionOption[] | null;
	readonly correctAnswer: string | null;
	readonly tolerance?: number;
}

export interface AttemptItem {
	readonly id: string;
	readonly attemptId: string;
	readonly questionId: string;
	readonly answer: unknown;
	readonly isCorrect: boolean | null;
	readonly score: number | null;
	readonly sortOrder: number;
	readonly answeredAt: Date | null;
}

export interface Attempt {
	readonly id: string;
	readonly userId: string;
	readonly examInstanceId: string;
	readonly status: AttemptStatus;
	readonly startedAt: Date | null;
	readonly submittedAt: Date | null;
	readonly totalScore: number | null;
	readonly maxScore: number | null;
	readonly ipAddress: string | null;
}

export interface ExamInstanceView {
	readonly id: string;
	readonly examId: string;
	readonly startsAt: Date;
	readonly endsAt: Date;
	readonly quitUrl: string | null;
	readonly exam: {
		readonly id: string;
		readonly title: string;
		readonly totalMarks: number;
		readonly durationMinutes: number;
		readonly easyPct: number;
		readonly mediumPct: number;
		readonly hardPct: number;
	};
}

export interface SectionWithPool {
	readonly id: string;
	readonly questionsToAssign: number;
	readonly sortOrder: number;
	readonly questions: readonly ScoredQuestion[];
}
