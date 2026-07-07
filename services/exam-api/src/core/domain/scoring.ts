import { QuestionType } from "./enums";
import type { ScoredQuestion } from "./models";

/**
 * Per-question-type scoring strategies (PRD SCORE-01 parity).
 *
 * Pure domain logic — no persistence, no framework. Ported verbatim from the
 * legacy NestJS `AttemptService` so scores stay identical across both engines.
 */

export interface ScoringResult {
	readonly isCorrect: boolean;
	readonly score: number;
}

const wrong = (q: ScoredQuestion, penalize: boolean): ScoringResult => ({
	isCorrect: false,
	score: penalize ? -q.negativeMarks : 0,
});

function scoreMcq(question: ScoredQuestion, answer: unknown): ScoringResult {
	const options = question.options ?? [];
	const correctIdx = options.findIndex((o) => o.isCorrect);
	if (correctIdx === -1) return { isCorrect: false, score: 0 };
	const match = options[correctIdx];
	const correctId = match?.id ?? String(correctIdx);
	const isCorrect = correctId === answer;
	return { isCorrect, score: isCorrect ? question.marks : -question.negativeMarks };
}

function scoreMultiSelect(question: ScoredQuestion, answer: unknown): ScoringResult {
	const options = question.options ?? [];
	const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id ?? "");
	const selected = Array.isArray(answer) ? (answer as string[]) : [];
	const allCorrect = correctIds.every((id) => selected.includes(id));
	const noExtra = selected.every((id) => correctIds.includes(id));
	const isCorrect = allCorrect && noExtra && correctIds.length > 0;
	return { isCorrect, score: isCorrect ? question.marks : -question.negativeMarks };
}

function scoreTrueFalse(question: ScoredQuestion, answer: unknown): ScoringResult {
	const isCorrect = String(answer).toLowerCase() === String(question.correctAnswer).toLowerCase();
	return { isCorrect, score: isCorrect ? question.marks : -question.negativeMarks };
}

function scoreShortAnswer(question: ScoredQuestion, answer: unknown): ScoringResult {
	const isCorrect =
		String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
	return isCorrect ? { isCorrect: true, score: question.marks } : wrong(question, false);
}

function scoreNumeric(question: ScoredQuestion, answer: unknown): ScoringResult {
	const tolerance = question.tolerance ?? 0;
	const submitted = Number.parseFloat(String(answer));
	const correct = Number.parseFloat(String(question.correctAnswer));
	const isCorrect = !Number.isNaN(submitted) && Math.abs(submitted - correct) <= tolerance;
	return isCorrect ? { isCorrect: true, score: question.marks } : wrong(question, false);
}

export function scoreQuestion(question: ScoredQuestion, answer: unknown): ScoringResult {
	switch (question.type) {
		case QuestionType.MCQ:
			return scoreMcq(question, answer);
		case QuestionType.TRUE_FALSE:
			return scoreTrueFalse(question, answer);
		case QuestionType.MULTI_SELECT:
			return scoreMultiSelect(question, answer);
		case QuestionType.SHORT_ANSWER:
			return scoreShortAnswer(question, answer);
		case QuestionType.NUMERIC:
			return scoreNumeric(question, answer);
		default:
			return scoreMcq(question, answer);
	}
}
