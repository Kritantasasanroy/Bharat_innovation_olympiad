import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Attempt, AttemptItem } from "../../../core/domain/models";
import { ProviderError } from "../../../core/errors";
import type { AttemptRepository, NewAttempt, NewAttemptItem } from "../../../core/ports/out";
import { getDb } from "./postgres.client";
import { attemptItems, attempts } from "./schema/schema";

type AttemptRow = typeof attempts.$inferSelect;
type ItemRow = typeof attemptItems.$inferSelect;

function toAttempt(row: AttemptRow): Attempt {
	return {
		id: row.id,
		userId: row.userId,
		examInstanceId: row.examInstanceId,
		status: row.status,
		startedAt: row.startedAt,
		submittedAt: row.submittedAt,
		totalScore: row.totalScore,
		maxScore: row.maxScore,
		ipAddress: row.ipAddress,
	};
}

function toItem(row: ItemRow): AttemptItem {
	return {
		id: row.id,
		attemptId: row.attemptId,
		questionId: row.questionId,
		answer: row.answer,
		isCorrect: row.isCorrect,
		score: row.score,
		sortOrder: row.sortOrder,
		answeredAt: row.answeredAt,
	};
}

/** Drizzle-backed {@link AttemptRepository} over the shared Postgres tables. */
export class DrizzleAttemptRepository implements AttemptRepository {
	private readonly db = getDb();

	async findByUserAndInstance(userId: string, examInstanceId: string): Promise<Attempt | null> {
		const rows = await this.db
			.select()
			.from(attempts)
			.where(and(eq(attempts.userId, userId), eq(attempts.examInstanceId, examInstanceId)))
			.limit(1);
		const row = rows[0];
		return row ? toAttempt(row) : null;
	}

	async findById(id: string): Promise<Attempt | null> {
		const rows = await this.db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
		const row = rows[0];
		return row ? toAttempt(row) : null;
	}

	async startAttempt(data: NewAttempt): Promise<Attempt> {
		const rows = await this.db
			.insert(attempts)
			.values({
				id: data.id,
				userId: data.userId,
				examInstanceId: data.examInstanceId,
				status: "IN_PROGRESS",
				startedAt: data.startedAt,
				ipAddress: data.ipAddress,
				maxScore: data.maxScore,
			})
			.onConflictDoUpdate({
				target: [attempts.userId, attempts.examInstanceId],
				set: { status: "IN_PROGRESS", startedAt: data.startedAt, ipAddress: data.ipAddress },
			})
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("startAttempt returned no row"));
		return toAttempt(row);
	}

	async reopen(id: string, startedAt: Date, ipAddress: string | null): Promise<Attempt> {
		const rows = await this.db
			.update(attempts)
			.set({ status: "IN_PROGRESS", startedAt, submittedAt: null, totalScore: null, ipAddress })
			.where(eq(attempts.id, id))
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("reopen returned no row"));
		return toAttempt(row);
	}

	async finalize(
		id: string,
		status: Attempt["status"],
		submittedAt: Date,
		totalScore: number,
	): Promise<Attempt> {
		const rows = await this.db
			.update(attempts)
			.set({ status, submittedAt, totalScore })
			.where(eq(attempts.id, id))
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("finalize returned no row"));
		return toAttempt(row);
	}

	async createItems(attemptId: string, items: readonly NewAttemptItem[]): Promise<void> {
		if (items.length === 0) return;
		await this.db
			.insert(attemptItems)
			.values(
				items.map((it) => ({
					id: randomUUID(),
					attemptId,
					questionId: it.questionId,
					sortOrder: it.sortOrder,
				})),
			)
			.onConflictDoNothing();
	}

	async clearItems(attemptId: string): Promise<void> {
		await this.db.delete(attemptItems).where(eq(attemptItems.attemptId, attemptId));
	}

	async findItems(attemptId: string): Promise<AttemptItem[]> {
		const rows = await this.db
			.select()
			.from(attemptItems)
			.where(eq(attemptItems.attemptId, attemptId))
			.orderBy(asc(attemptItems.sortOrder));
		return rows.map(toItem);
	}

	async upsertAnswer(
		attemptId: string,
		questionId: string,
		answer: unknown,
		answeredAt: Date,
	): Promise<AttemptItem> {
		const rows = await this.db
			.insert(attemptItems)
			.values({ id: randomUUID(), attemptId, questionId, answer, answeredAt })
			.onConflictDoUpdate({
				target: [attemptItems.attemptId, attemptItems.questionId],
				set: { answer, answeredAt },
			})
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("upsertAnswer returned no row"));
		return toItem(row);
	}

	async setItemScore(itemId: string, isCorrect: boolean, score: number): Promise<void> {
		await this.db.update(attemptItems).set({ isCorrect, score }).where(eq(attemptItems.id, itemId));
	}
}
