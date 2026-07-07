import { AttemptStatus } from "../domain/enums";
import type {
	Attempt,
	AttemptItem,
	ExamInstanceView,
	QuestionView,
	ScoredQuestion,
} from "../domain/models";
import { buildQuestionSet } from "../domain/question-set";
import { scoreQuestion } from "../domain/scoring";
import { AttemptStateError, ForbiddenError, NotFoundError } from "../errors";
import type {
	AttemptWithQuestions,
	SaveAnswerInput,
	StartAttemptInput,
	SubmitResult,
} from "../ports/in";
import type {
	AttemptRepository,
	Clock,
	EntitlementGate,
	EventPublisher,
	ExamSnapshotRepository,
	IdGenerator,
	TimerStore,
} from "../ports/out";

export interface AttemptServiceDeps {
	readonly attempts: AttemptRepository;
	readonly exams: ExamSnapshotRepository;
	readonly entitlement: EntitlementGate;
	readonly timer: TimerStore;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: EventPublisher;
	readonly isDemoExam: (examId: string) => boolean;
}

const TIMER_TTL_SECS = 6 * 60 * 60;

/** Drop answer-key fields before a question crosses the HTTP boundary. */
function toQuestionView(q: ScoredQuestion): QuestionView {
	return {
		id: q.id,
		type: q.type,
		difficulty: q.difficulty,
		text: q.text,
		options: q.options ? q.options.map((o) => ({ id: o.id, text: o.text })) : null,
		marks: q.marks,
		negativeMarks: q.negativeMarks,
		timeLimitSecs: q.timeLimitSecs,
		mediaUrl: q.mediaUrl,
		mediaType: q.mediaType,
		tags: q.tags,
		explanation: q.explanation,
	};
}

/**
 * Exam-window runtime application service — attempt lifecycle use cases
 * (EXAM-02/03/05) over hexagonal ports. No persistence or HTTP concerns leak in.
 * Ported from the legacy NestJS `AttemptService`; the durable timer
 * (EXAM-04) delegates to {@link TimerStore}.
 */
export class AttemptService {
	constructor(private readonly deps: AttemptServiceDeps) {}

	async start(input: StartAttemptInput): Promise<AttemptWithQuestions> {
		const { userId, instanceId, ipAddress } = input;
		const instance = await this.deps.exams.getInstance(instanceId);
		if (!instance) throw new NotFoundError("Exam instance", instanceId);

		const now = this.deps.clock.now();
		if (now < instance.startsAt) throw new AttemptStateError("Exam has not started yet");
		if (now > instance.endsAt) throw new AttemptStateError("Exam window has closed");

		const isDemo = this.deps.isDemoExam(instance.examId);
		await this.deps.entitlement.assertCanStart(userId, instance, isDemo);

		const existing = await this.deps.attempts.findByUserAndInstance(userId, instanceId);

		if (existing && existing.status === AttemptStatus.IN_PROGRESS) {
			let items = await this.deps.attempts.findItems(existing.id);
			if (items.length === 0) {
				await this.initializeQuestionSet(existing.id, instance, userId);
				items = await this.deps.attempts.findItems(existing.id);
			}
			await this.armTimer(existing, instance);
			return { attempt: { ...existing, items }, questions: await this.questionsForItems(items) };
		}

		if (existing && existing.status !== AttemptStatus.NOT_STARTED) {
			if (!isDemo) throw new AttemptStateError("You have already completed this exam");
			// Demo exams allow unlimited retakes: reopen the same row in place.
			await this.deps.attempts.clearItems(existing.id);
			const reopened = await this.deps.attempts.reopen(existing.id, now, ipAddress);
			return this.freshSet(reopened, instance, userId);
		}

		const attempt = await this.deps.attempts.startAttempt({
			id: this.deps.ids.uuid(),
			userId,
			examInstanceId: instanceId,
			startedAt: now,
			ipAddress,
			maxScore: instance.exam.totalMarks,
		});
		return this.freshSet(attempt, instance, userId);
	}

	async saveAnswer(input: SaveAnswerInput): Promise<AttemptItem> {
		const attempt = await this.deps.attempts.findById(input.attemptId);
		this.assertOwnedAndActive(attempt, input.userId);
		return this.deps.attempts.upsertAnswer(
			input.attemptId,
			input.questionId,
			input.answer,
			this.deps.clock.now(),
		);
	}

	async submit(input: { attemptId: string; userId: string }): Promise<SubmitResult> {
		const attempt = await this.deps.attempts.findById(input.attemptId);
		this.assertOwnedAndActive(attempt, input.userId);
		const active = attempt as Attempt;
		const finalized = await this.scoreAndFinalize(active, AttemptStatus.SUBMITTED);
		const instance = await this.deps.exams.getInstance(active.examInstanceId);
		return { attempt: finalized, redirectUrl: instance?.quitUrl ?? undefined };
	}

	/** Called by the durable timer on expiry. Idempotent: no-ops if not active. */
	async autoSubmit(attemptId: string): Promise<void> {
		const attempt = await this.deps.attempts.findById(attemptId);
		if (!attempt || attempt.status !== AttemptStatus.IN_PROGRESS) return;
		await this.scoreAndFinalize(attempt, AttemptStatus.AUTO_SUBMITTED);
	}

	async getAttempt(input: {
		attemptId: string;
		userId: string;
	}): Promise<Attempt & { readonly items: readonly AttemptItem[] }> {
		const attempt = await this.deps.attempts.findById(input.attemptId);
		if (!attempt) throw new NotFoundError("Attempt", input.attemptId);
		if (attempt.userId !== input.userId) throw new ForbiddenError();
		const items = await this.deps.attempts.findItems(input.attemptId);
		return { ...attempt, items };
	}

	// ── internals ──────────────────────────────────────────────────────────

	private async freshSet(
		attempt: Attempt,
		instance: ExamInstanceView,
		userId: string,
	): Promise<AttemptWithQuestions> {
		const questions = await this.initializeQuestionSet(attempt.id, instance, userId);
		const items = await this.deps.attempts.findItems(attempt.id);
		await this.armTimer(attempt, instance);
		return { attempt: { ...attempt, items }, questions: questions.map(toQuestionView) };
	}

	private assertOwnedAndActive(attempt: Attempt | null, userId: string): void {
		if (!attempt) throw new NotFoundError("Attempt");
		if (attempt.userId !== userId) throw new ForbiddenError();
		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new AttemptStateError("Attempt is not active");
		}
	}

	private async scoreAndFinalize(attempt: Attempt, status: Attempt["status"]): Promise<Attempt> {
		const items = await this.deps.attempts.findItems(attempt.id);
		const answered = items.filter((i) => i.answer != null);
		const keys = await this.deps.exams.getScoredQuestionsByIds(answered.map((i) => i.questionId));

		let totalScore = 0;
		for (const item of answered) {
			const q = keys.get(item.questionId);
			if (!q) continue;
			const result = scoreQuestion(q, item.answer);
			totalScore += result.score;
			await this.deps.attempts.setItemScore(item.id, result.isCorrect, result.score);
		}

		await this.deps.timer.clear(attempt.id);
		const finalized = await this.deps.attempts.finalize(
			attempt.id,
			status,
			this.deps.clock.now(),
			totalScore,
		);
		await this.publishSubmission(finalized, status, answered.length);
		return finalized;
	}

	private async publishSubmission(
		attempt: Attempt,
		status: Attempt["status"],
		answeredCount: number,
	): Promise<void> {
		const instance = await this.deps.exams.getInstance(attempt.examInstanceId);
		const examSnapshotId = instance?.examId ?? attempt.examInstanceId;
		const submittedAt = attempt.submittedAt ?? this.deps.clock.now();
		if (status === AttemptStatus.SUBMITTED) {
			await this.deps.events.publish({
				type: "attempt.submitted",
				attemptId: attempt.id,
				studentId: attempt.userId,
				examSnapshotId,
				answeredCount,
				submittedAt,
				reason: "USER",
			});
		} else if (status === AttemptStatus.AUTO_SUBMITTED) {
			await this.deps.events.publish({
				type: "attempt.auto_submitted",
				attemptId: attempt.id,
				studentId: attempt.userId,
				examSnapshotId,
				answeredCount,
				submittedAt,
				reason: "TIMER_EXPIRED",
			});
		}
	}

	private async initializeQuestionSet(
		attemptId: string,
		instance: ExamInstanceView,
		userId: string,
	): Promise<ScoredQuestion[]> {
		const sections = await this.deps.exams.getSectionsWithPool(instance.examId);
		const questions = buildQuestionSet(
			sections,
			instance.examId,
			userId,
			instance.exam.easyPct,
			instance.exam.mediumPct,
			instance.exam.hardPct,
		);
		await this.deps.attempts.createItems(
			attemptId,
			questions.map((q, idx) => ({ questionId: q.id, sortOrder: idx })),
		);
		return questions;
	}

	private async questionsForItems(items: readonly AttemptItem[]): Promise<QuestionView[]> {
		const keys = await this.deps.exams.getScoredQuestionsByIds(items.map((i) => i.questionId));
		const views: QuestionView[] = [];
		for (const item of items) {
			const q = keys.get(item.questionId);
			if (q) views.push(toQuestionView(q));
		}
		return views;
	}

	private async armTimer(attempt: Attempt, instance: ExamInstanceView): Promise<void> {
		if (!attempt.startedAt) return;
		const deadlineMs = attempt.startedAt.getTime() + instance.exam.durationMinutes * 60_000;
		await this.deps.timer.setDeadline(attempt.id, deadlineMs, TIMER_TTL_SECS);
	}
}
