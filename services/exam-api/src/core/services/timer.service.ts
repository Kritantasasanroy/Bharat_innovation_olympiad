import { AttemptStatus } from "../domain/enums";
import { ForbiddenError, NotFoundError } from "../errors";
import type { TimerSnapshot } from "../ports/in";
import type { AttemptRepository, Clock, ExamSnapshotRepository, TimerStore } from "../ports/out";

export interface TimerServiceDeps {
	readonly attempts: AttemptRepository;
	readonly exams: ExamSnapshotRepository;
	readonly timer: TimerStore;
	readonly clock: Clock;
	/** Injected to avoid a cycle with AttemptService. */
	readonly autoSubmit: (attemptId: string) => Promise<void>;
}

const TIMER_TTL_SECS = 6 * 60 * 60;

/**
 * Server-authoritative durable timer (PRD EXAM-04).
 *
 * Never trusts client clocks: the deadline is derived from the persisted
 * `startedAt` + exam duration and cached in Redis so it survives restarts. On a
 * cache miss the deadline is recomputed from the database. When the deadline has
 * passed on an active attempt, the timer triggers auto-submit before answering.
 */
export class TimerService {
	constructor(private readonly deps: TimerServiceDeps) {}

	async getSnapshot(input: { attemptId: string; userId: string }): Promise<TimerSnapshot> {
		const attempt = await this.deps.attempts.findById(input.attemptId);
		if (!attempt) throw new NotFoundError("Attempt", input.attemptId);
		if (attempt.userId !== input.userId) throw new ForbiddenError();

		const instance = await this.deps.exams.getInstance(attempt.examInstanceId);
		const totalSecs = (instance?.exam.durationMinutes ?? 0) * 60;

		if (attempt.status !== AttemptStatus.IN_PROGRESS || !attempt.startedAt) {
			return { remainingSecs: 0, totalSecs, status: attempt.status, expired: true };
		}

		let deadlineMs = await this.deps.timer.getDeadline(input.attemptId);
		if (deadlineMs === null) {
			deadlineMs = attempt.startedAt.getTime() + totalSecs * 1000;
			await this.deps.timer.setDeadline(input.attemptId, deadlineMs, TIMER_TTL_SECS);
		}

		const remainingSecs = Math.max(
			0,
			Math.ceil((deadlineMs - this.deps.clock.now().getTime()) / 1000),
		);

		if (remainingSecs <= 0) {
			await this.deps.autoSubmit(input.attemptId);
			return { remainingSecs: 0, totalSecs, status: AttemptStatus.AUTO_SUBMITTED, expired: true };
		}

		return { remainingSecs, totalSecs, status: attempt.status, expired: false };
	}
}
