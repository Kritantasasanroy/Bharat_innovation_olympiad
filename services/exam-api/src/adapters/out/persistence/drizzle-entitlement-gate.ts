import { and, eq, inArray } from "drizzle-orm";
import type { ExamInstanceView } from "../../../core/domain/models";
import { EntitlementError, FaceEnrollmentRequiredError } from "../../../core/errors";
import type { Clock, EntitlementGate } from "../../../core/ports/out";
import { getDb } from "./postgres.client";
import { bookings, examSlots, users } from "./schema/schema";

/**
 * Attempt-start entitlement gate (PRD EXAM-02), enforced server-side regardless
 * of any frontend check. Mirrors the legacy NestJS `startAttempt` gate:
 *  1. Face enrollment must exist.
 *  2. When the instance has slots, the student needs a CONFIRMED booking whose
 *     slot window contains "now". Demo exams skip the slot check.
 */
export class DrizzleEntitlementGate implements EntitlementGate {
	private readonly db = getDb();

	constructor(private readonly clock: Clock) {}

	async assertCanStart(userId: string, instance: ExamInstanceView, isDemo: boolean): Promise<void> {
		const userRows = await this.db
			.select({ faceEmbedding: users.faceEmbedding })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!userRows[0]?.faceEmbedding) {
			throw new FaceEnrollmentRequiredError();
		}

		if (isDemo) return;

		const slots = await this.db
			.select({ id: examSlots.id })
			.from(examSlots)
			.where(eq(examSlots.examInstanceId, instance.id));
		if (slots.length === 0) return; // instance has no slots — backward compatible

		const now = this.clock.now();
		const confirmed = await this.db
			.select({ startsAt: examSlots.startsAt, endsAt: examSlots.endsAt })
			.from(bookings)
			.innerJoin(examSlots, eq(bookings.slotId, examSlots.id))
			.where(
				and(
					eq(bookings.userId, userId),
					eq(bookings.status, "CONFIRMED"),
					inArray(
						examSlots.id,
						slots.map((s) => s.id),
					),
				),
			);

		if (confirmed.length === 0) {
			throw new EntitlementError("You need a confirmed slot booking to start this exam");
		}
		const inWindow = confirmed.some((b) => now >= b.startsAt && now <= b.endsAt);
		if (!inWindow) {
			throw new EntitlementError("You are outside your booked slot window");
		}
	}
}
