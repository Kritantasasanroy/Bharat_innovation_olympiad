import { Difficulty } from "./enums";
import type { ScoredQuestion, SectionWithPool } from "./models";

/**
 * Deterministic per-student question-set builder (PRD EXAM-03 pool model).
 *
 * Pure domain logic ported from the legacy NestJS `AttemptService`:
 *  - Each section holds the full pool; `questionsToAssign` picks how many a
 *    student receives (0 = all).
 *  - Difficulty buckets are filled to easyPct/mediumPct/hardPct of the target,
 *    deficits topped up from a seeded leftover shuffle.
 *  - A final cross-section shuffle guarantees unique ordering even when two
 *    students receive identical subsets.
 *
 * Seeds are derived from `userId:examId:sectionId` so the same student always
 * gets the same set (stable across resumes) while different students diverge.
 */

/** FNV-1a 32-bit — stable string to unsigned int. */
export function fnvHash(str: string): number {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Deterministic Fisher-Yates using xorshift32 seeded from {@link fnvHash}. */
export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
	let s = fnvHash(seed);
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		s >>>= 0;
		const j = s % (i + 1);
		const a = out[i] as T;
		const b = out[j] as T;
		out[i] = b;
		out[j] = a;
	}
	return out;
}

export function buildQuestionSet(
	sections: readonly SectionWithPool[],
	examId: string,
	userId: string,
	easyPct: number,
	mediumPct: number,
	hardPct: number,
): ScoredQuestion[] {
	const result: ScoredQuestion[] = [];

	for (const section of [...sections].sort((a, b) => a.sortOrder - b.sortOrder)) {
		const all = section.questions;
		if (all.length === 0) continue;

		const seed = `${userId}:${examId}:${section.id}`;
		const target =
			section.questionsToAssign > 0 ? Math.min(section.questionsToAssign, all.length) : all.length;

		const easy = all.filter((q) => q.difficulty === Difficulty.EASY);
		const medium = all.filter((q) => q.difficulty === Difficulty.MEDIUM);
		const hard = all.filter((q) => q.difficulty === Difficulty.HARD);

		const easyN = Math.min(Math.round((easyPct / 100) * target), easy.length);
		const mediumN = Math.min(Math.round((mediumPct / 100) * target), medium.length);
		const hardN = Math.min(Math.round((hardPct / 100) * target), hard.length);

		const selected: ScoredQuestion[] = [
			...seededShuffle(easy, `${seed}:e`).slice(0, easyN),
			...seededShuffle(medium, `${seed}:m`).slice(0, mediumN),
			...seededShuffle(hard, `${seed}:h`).slice(0, hardN),
		];

		const selectedIds = new Set(selected.map((q) => q.id));
		const leftover = seededShuffle(
			all.filter((q) => !selectedIds.has(q.id)),
			`${seed}:fill`,
		);
		const deficit = target - selected.length;
		if (deficit > 0) selected.push(...leftover.slice(0, deficit));

		result.push(...selected);
	}

	return seededShuffle(result, `${userId}:${examId}:order`);
}
