import type { Attempt, AttemptItem, QuestionView } from "../../domain/models";

/** Attempt + ordered items + the student-facing (key-stripped) question list. */
export interface AttemptWithQuestions {
	readonly attempt: Attempt & { readonly items: readonly AttemptItem[] };
	readonly questions: readonly QuestionView[];
}

export interface StartAttemptInput {
	readonly userId: string;
	readonly instanceId: string;
	readonly ipAddress: string | null;
}

/** EXAM-02/03: gate entitlement, build the set, create or resume the attempt. */
export interface StartAttemptUseCase {
	execute(input: StartAttemptInput): Promise<AttemptWithQuestions>;
}

export interface SaveAnswerInput {
	readonly attemptId: string;
	readonly userId: string;
	readonly questionId: string;
	readonly answer: unknown;
}

/** EXAM-03: autosave a single answer (idempotent upsert). */
export interface SaveAnswerUseCase {
	execute(input: SaveAnswerInput): Promise<AttemptItem>;
}

export interface SubmitResult {
	readonly attempt: Attempt;
	readonly redirectUrl: string | undefined;
}

/** EXAM-05: score every answered item and finalize the attempt. */
export interface SubmitAttemptUseCase {
	execute(input: { attemptId: string; userId: string }): Promise<SubmitResult>;
}

/** Read an attempt (ownership-checked) with its ordered items. */
export interface GetAttemptUseCase {
	execute(input: {
		attemptId: string;
		userId: string;
	}): Promise<Attempt & { readonly items: readonly AttemptItem[] }>;
}

export interface TimerSnapshot {
	readonly remainingSecs: number;
	readonly totalSecs: number;
	readonly status: Attempt["status"];
	readonly expired: boolean;
}

/** EXAM-04: server-authoritative remaining time; auto-submits on expiry. */
export interface GetTimerUseCase {
	execute(input: { attemptId: string; userId: string }): Promise<TimerSnapshot>;
}
