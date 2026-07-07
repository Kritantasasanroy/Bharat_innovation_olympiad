import { randomUUID } from "node:crypto";
import { RedisTimerStore } from "./adapters/out/cache/redis-timer-store";
import { ContractEventPublisher } from "./adapters/out/events/contract-event-publisher";
import { DrizzleAttemptRepository } from "./adapters/out/persistence/drizzle-attempt.repository";
import { DrizzleEntitlementGate } from "./adapters/out/persistence/drizzle-entitlement-gate";
import { DrizzleExamSnapshotRepository } from "./adapters/out/persistence/drizzle-exam-snapshot.repository";
import type { Clock, IdGenerator } from "./core/ports/out";
import { AttemptService, TimerService } from "./core/services";
import { config } from "./infra/config";

/**
 * Composition root. Instantiates outbound adapters and injects them into the
 * application services. This is the only place allowed to wire `core` to
 * `adapters` (the boundaries lint keeps `core` itself framework-free).
 */

const clock: Clock = { now: () => new Date() };
const ids: IdGenerator = { uuid: () => randomUUID() };

const attemptRepository = new DrizzleAttemptRepository();
const examSnapshotRepository = new DrizzleExamSnapshotRepository();
const timerStore = new RedisTimerStore();
const entitlementGate = new DrizzleEntitlementGate(clock);
const eventPublisher = new ContractEventPublisher();

const demoExamIds = new Set(config.demoExamIds);
const isDemoExam = (examId: string): boolean => demoExamIds.has(examId);

export const attemptService = new AttemptService({
	attempts: attemptRepository,
	exams: examSnapshotRepository,
	entitlement: entitlementGate,
	timer: timerStore,
	clock,
	ids,
	events: eventPublisher,
	isDemoExam,
});

export const timerService = new TimerService({
	attempts: attemptRepository,
	exams: examSnapshotRepository,
	timer: timerStore,
	clock,
	autoSubmit: (attemptId: string) => attemptService.autoSubmit(attemptId),
});
