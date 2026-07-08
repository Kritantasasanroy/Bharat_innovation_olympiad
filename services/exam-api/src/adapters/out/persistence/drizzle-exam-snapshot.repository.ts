import { asc, eq, inArray } from "drizzle-orm";
import type {
	ExamInstanceView,
	QuestionOption,
	ScoredQuestion,
	SectionWithPool,
} from "../../../core/domain/models";
import type { ExamSnapshotRepository } from "../../../core/ports/out";
import { getDb } from "./postgres.client";
import { examInstances, examSections, exams, questions, sectionQuestions } from "./schema/schema";

type QuestionRow = typeof questions.$inferSelect;

function toScored(row: QuestionRow): ScoredQuestion {
	return {
		id: row.id,
		type: row.type,
		difficulty: row.difficulty,
		text: row.text,
		options: (row.options as QuestionOption[] | null) ?? null,
		marks: row.marks,
		negativeMarks: row.negativeMarks,
		timeLimitSecs: row.timeLimitSecs,
		mediaUrl: row.mediaUrl,
		mediaType: row.mediaType,
		tags: row.tags,
		explanation: row.explanation,
		correctAnswer: row.correctAnswer,
	};
}

/** Drizzle-backed read model. Answer keys are used only inside the domain. */
export class DrizzleExamSnapshotRepository implements ExamSnapshotRepository {
	private readonly db = getDb();

	async getInstance(instanceId: string): Promise<ExamInstanceView | null> {
		const rows = await this.db
			.select({ instance: examInstances, exam: exams })
			.from(examInstances)
			.innerJoin(exams, eq(examInstances.examId, exams.id))
			.where(eq(examInstances.id, instanceId))
			.limit(1);
		const row = rows[0];
		if (!row) return null;
		return {
			id: row.instance.id,
			examId: row.instance.examId,
			startsAt: row.instance.startsAt,
			endsAt: row.instance.endsAt,
			quitUrl: row.instance.quitUrl,
			exam: {
				id: row.exam.id,
				title: row.exam.title,
				totalMarks: row.exam.totalMarks,
				durationMinutes: row.exam.durationMinutes,
				easyPct: row.exam.easyPct,
				mediumPct: row.exam.mediumPct,
				hardPct: row.exam.hardPct,
			},
		};
	}

	async getSectionsWithPool(examId: string): Promise<SectionWithPool[]> {
		const secs = await this.db
			.select()
			.from(examSections)
			.where(eq(examSections.examId, examId))
			.orderBy(asc(examSections.sortOrder));
		if (secs.length === 0) return [];

		const rows = await this.db
			.select({ sectionId: sectionQuestions.sectionId, q: questions })
			.from(sectionQuestions)
			.innerJoin(questions, eq(sectionQuestions.questionId, questions.id))
			.where(
				inArray(
					sectionQuestions.sectionId,
					secs.map((s) => s.id),
				),
			)
			.orderBy(asc(sectionQuestions.sortOrder));

		const bySection = new Map<string, ScoredQuestion[]>();
		for (const r of rows) {
			const list = bySection.get(r.sectionId) ?? [];
			list.push(toScored(r.q));
			bySection.set(r.sectionId, list);
		}

		return secs.map((s) => ({
			id: s.id,
			questionsToAssign: s.questionsToAssign,
			sortOrder: s.sortOrder,
			questions: bySection.get(s.id) ?? [],
		}));
	}

	async getScoredQuestionsByIds(ids: readonly string[]): Promise<Map<string, ScoredQuestion>> {
		const out = new Map<string, ScoredQuestion>();
		if (ids.length === 0) return out;
		const rows = await this.db
			.select()
			.from(questions)
			.where(inArray(questions.id, [...ids]));
		for (const row of rows) out.set(row.id, toScored(row));
		return out;
	}
}
