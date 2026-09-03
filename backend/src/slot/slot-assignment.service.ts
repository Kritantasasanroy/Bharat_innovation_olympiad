import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import type { ExamSlot } from '@prisma/client';
import { isDemoExam } from '../common/demo-exams';
import { PrismaService } from '../prisma/prisma.service';
import {
    CandidateDate,
    SearchRules,
    UnassignedReason,
    candidateDates,
    istStartOfDay,
    slotWindow,
    unassignedMessage,
    weekdayName,
} from './slot-assignment.rules';
import { SlotTimingService } from './slot-timing.service';

export type AssignmentStatus =
    /** A sitting was found and the student is now booked into it. */
    | 'ASSIGNED'
    /** The student already held a sitting for this instance; nothing changed. */
    | 'ALREADY_ASSIGNED'
    /** No sitting could be found. `reason` says why. */
    | 'UNASSIGNED'
    /** This exam runs no slots at all (practice, trial, or slots waived). */
    | 'NOT_APPLICABLE';

export interface AssignmentResult {
    status: AssignmentStatus;
    examInstanceId: string;
    bookingId?: string;
    slotId?: string;
    slotStartsAt?: Date;
    reason?: UnassignedReason;
    message?: string;
    /** How many dates were tried before giving up — for admin diagnostics. */
    datesConsidered?: number;
}

/**
 * Auto-assigns every student a sitting when they register, and lets an admin
 * override the result afterwards.
 *
 * ## The rule
 *
 * A student registering on day 0 is offered the **first Sunday on or after day
 * 14**. If that sitting is full, the next Sunday, and so on out to **day 56**.
 * Only when every Sunday in that window is full does the search start again
 * from the first Saturday on or after day 14 and walk the Saturdays the same
 * way. The window, and the order of preferred days, are per-instance columns
 * (`slotLeadDays`, `slotHorizonDays`, `slotDayPreference`) so the policy is data
 * rather than code; the defaults are exactly the rule above.
 *
 * The date ordering itself lives in `slot-assignment.rules.ts` as a pure
 * function — this service only walks the list it produces and tries to claim a
 * seat on each.
 *
 * ## What it is *not* gated on
 *
 * Payment. The sitting is an appointment, made at registration, before any
 * money has changed hands; whether the student may actually *start* the exam is
 * a separate account-level check against `AccessPass` in `AttemptService`.
 * Conflating the two is what the old pay-then-pick flow did, and it left every
 * unpaid student with no date at all until the moment they paid.
 */
@Injectable()
export class SlotAssignmentService {
    private readonly logger = new Logger(SlotAssignmentService.name);

    constructor(
        private prisma: PrismaService,
        private timings: SlotTimingService,
    ) {}

    // ── Entry points ──────────────────────────────────────────────────────────

    /**
     * Assigns a newly registered student across every exam instance that needs a
     * sitting. Called from registration.
     *
     * Best-effort by construction: an instance that cannot be filled is reported,
     * not thrown, because a full Sunday must never be the reason a student cannot
     * finish signing up. The caller logs; the admin sees the same students on the
     * "unassigned" list and can place them by hand.
     */
    async assignForNewStudent(userId: string): Promise<AssignmentResult[]> {
        const instances = await this.slotBearingInstances();
        const results: AssignmentResult[] = [];
        for (const instanceId of instances) {
            try {
                results.push(await this.ensureAssignment(userId, instanceId));
            } catch (err) {
                this.logger.error(
                    `Slot assignment failed for user ${userId} on instance ${instanceId}: ${(err as Error).message}`,
                );
            }
        }
        return results;
    }

    /**
     * The idempotent core: make sure this student has a sitting for this
     * instance, and return what happened.
     *
     * Safe to call on every read — the exam list and the student's schedule page
     * both do — which is what makes a student who registered before an admin
     * configured any timings pick one up as soon as one exists, rather than
     * staying unassigned forever because their one chance was at signup.
     */
    async ensureAssignment(userId: string, examInstanceId: string): Promise<AssignmentResult> {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { id: true, isTrial: true, requiresSlot: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        if (!this.needsSlot(instance.exam)) {
            return { status: 'NOT_APPLICABLE', examInstanceId };
        }

        const existing = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId },
            },
            include: { slot: { select: { id: true, startsAt: true } } },
        });
        if (existing) {
            return {
                status: 'ALREADY_ASSIGNED',
                examInstanceId,
                bookingId: existing.id,
                slotId: existing.slot.id,
                slotStartsAt: existing.slot.startsAt,
            };
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true, activatedAt: true, role: true },
        });
        if (!user) throw new NotFoundException('Student not found');
        if (user.role !== Role.STUDENT) {
            return { status: 'NOT_APPLICABLE', examInstanceId };
        }

        const rules = this.rulesFor(instance, user.activatedAt ?? user.createdAt);
        return this.place(userId, instance, rules, null);
    }

    // ── The search ────────────────────────────────────────────────────────────

    /**
     * Walks the candidate dates in order and claims the first seat available.
     *
     * On each date, every active timing for that weekday is tried in the admin's
     * own order, so a Sunday with a morning and an afternoon sitting fills the
     * morning first and only overflows to the afternoon when it is full — the
     * same "earliest acceptable option" logic the date loop applies, one level
     * down.
     */
    private async place(
        userId: string,
        instance: { id: string; startsAt: Date; endsAt: Date },
        rules: SearchRules,
        assignedBy: string | null,
    ): Promise<AssignmentResult> {
        const dates = candidateDates(rules);
        if (dates.length === 0) {
            return this.unassigned(instance.id, 'NO_CANDIDATE_DATES', rules, 0);
        }

        // A sitting outside the exam instance's own window could never be sat:
        // the phase gate refuses to start an exam before it opens or after it
        // closes, no matter what the student's slot says.
        const inWindow = dates.filter((d) => this.dateFitsExamWindow(d, instance));
        if (inWindow.length === 0) {
            return this.unassigned(instance.id, 'OUTSIDE_EXAM_WINDOW', rules, dates.length);
        }

        let sawAnyTiming = false;
        // A timing exists for the day but every one of its sittings was pushed
        // out by the exam's own window or by having already started. That is a
        // different problem from "full", and telling an admin to add seats when
        // the real fix is to widen the exam window would send them the wrong way.
        let sawOnlyUnusable = true;
        const now = new Date();

        for (const candidate of inWindow) {
            const timings = await this.timings.timingsForWeekday(instance.id, candidate.weekday);
            if (timings.length === 0) continue;
            sawAnyTiming = true;

            for (const timing of timings) {
                // Work out the real instants *before* materialising anything. A
                // sitting that has already started is a worthless seat, and one
                // that falls outside the exam's own window could never be sat —
                // creating either would leave a permanently unusable row behind
                // and make the sittings list lie about what is on offer.
                const when = slotWindow(candidate.date, timing.startMinute, timing.endMinute);
                if (when.startsAt <= now) continue;
                if (when.startsAt < instance.startsAt || when.endsAt > instance.endsAt) continue;

                sawOnlyUnusable = false;

                const slot = await this.timings.ensureSlot(timing, candidate.date);
                const bookingId = await this.claimSeat(userId, slot, assignedBy);
                if (!bookingId) continue;

                return {
                    status: 'ASSIGNED',
                    examInstanceId: instance.id,
                    bookingId,
                    slotId: slot.id,
                    slotStartsAt: slot.startsAt,
                    datesConsidered: inWindow.indexOf(candidate) + 1,
                };
            }
        }

        let reason: UnassignedReason;
        if (!sawAnyTiming) reason = 'NO_TIMINGS';
        else if (sawOnlyUnusable) reason = 'OUTSIDE_EXAM_WINDOW';
        else reason = 'ALL_FULL';

        return this.unassigned(instance.id, reason, rules, inWindow.length);
    }

    /**
     * Books one student into one sitting, or reports that it is full.
     *
     * The claim is a single atomic `UPDATE … WHERE booked < capacity`, not a
     * read-then-write: two students registering in the same instant would both
     * pass a separate capacity check before either committed, and a 50-seat
     * sitting would quietly seat 51.
     */
    private async claimSeat(
        userId: string,
        slot: ExamSlot,
        assignedBy: string | null,
    ): Promise<string | null> {
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.examSlot.updateMany({
                where: { id: slot.id, booked: { lt: slot.capacity } },
                data: { booked: { increment: 1 } },
            });
            if (claim.count === 0) return null;

            const booking = await tx.booking.create({
                data: {
                    userId,
                    slotId: slot.id,
                    status: BookingStatus.CONFIRMED,
                    assignedBy,
                },
            });
            return booking.id;
        });
    }

    // ── Admin overrides ───────────────────────────────────────────────────────

    /**
     * Moves one student to a specific sitting, creating their booking if they
     * had none. This is the admin's manual override of the auto-assignment, and
     * the only way a student's date ever changes.
     */
    async reassign(userId: string, slotId: string, adminId: string) {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Sitting not found');

        const existing = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId: slot.examInstanceId },
            },
        });

        if (existing?.slotId === slotId) return existing;

        const moved = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.examSlot.updateMany({
                where: { id: slotId, booked: { lt: slot.capacity } },
                data: { booked: { increment: 1 } },
            });
            if (claim.count === 0) {
                throw new ConflictException(
                    'That sitting is full. Raise its seat count first, or pick another.',
                );
            }

            if (!existing) {
                return tx.booking.create({
                    data: {
                        userId,
                        slotId,
                        status: BookingStatus.CONFIRMED,
                        assignedBy: adminId,
                    },
                });
            }

            // `booked > 0` guards against an already-zero counter going negative
            // if the seat was released by another path first.
            await tx.examSlot.updateMany({
                where: { id: existing.slotId, booked: { gt: 0 } },
                data: { booked: { decrement: 1 } },
            });
            return tx.booking.update({
                where: { id: existing.id },
                data: {
                    slotId,
                    status: BookingStatus.CONFIRMED,
                    assignedBy: adminId,
                },
            });
        });

        return moved;
    }

    /**
     * Releases a student's seat for an instance, leaving them unassigned.
     *
     * Admin-only and deliberately separate from `reassign`: an admin cancelling
     * a student out of an exam is a different act from moving them, and running
     * it through a "move" with no destination would hide that.
     */
    async release(userId: string, examInstanceId: string) {
        const booking = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId },
            },
        });
        if (!booking) throw new NotFoundException('This student has no sitting for that exam.');

        await this.prisma.$transaction([
            this.prisma.booking.update({
                where: { id: booking.id },
                data: { status: BookingStatus.CANCELLED },
            }),
            this.prisma.examSlot.updateMany({
                where: { id: booking.slotId, booked: { gt: 0 } },
                data: { booked: { decrement: 1 } },
            }),
        ]);
        return { success: true };
    }

    /**
     * Re-runs the search for every student of an instance who has no sitting.
     *
     * The recovery path for the two ways students end up unassigned: they
     * registered before any timing existed, or every sitting was full when they
     * did. Idempotent — students who already hold a seat are untouched.
     */
    async backfillInstance(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { id: true, isTrial: true, requiresSlot: true, classBands: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');
        if (!this.needsSlot(instance.exam)) {
            throw new BadRequestException('This exam does not use sittings.');
        }

        const students = await this.prisma.user.findMany({
            where: {
                role: Role.STUDENT,
                classBand: { in: instance.exam.classBands },
                bookings: {
                    none: {
                        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                        slot: { examInstanceId },
                    },
                },
            },
            select: { id: true, createdAt: true, activatedAt: true },
        });

        const summary = { considered: students.length, assigned: 0, unassigned: 0 };
        const failures: { userId: string; message: string }[] = [];

        for (const student of students) {
            const rules = this.rulesFor(instance, student.activatedAt ?? student.createdAt);
            const result = await this.place(student.id, instance, rules, null);
            if (result.status === 'ASSIGNED') summary.assigned += 1;
            else {
                summary.unassigned += 1;
                if (result.message) failures.push({ userId: student.id, message: result.message });
            }
        }

        return { ...summary, failures: failures.slice(0, 20) };
    }

    /** Students of an instance with no sitting, for the admin's attention list. */
    async listUnassigned(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: { exam: { select: { classBands: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        return this.prisma.user.findMany({
            where: {
                role: Role.STUDENT,
                classBand: { in: instance.exam.classBands },
                bookings: {
                    none: {
                        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                        slot: { examInstanceId },
                    },
                },
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                rollNumber: true,
                classBand: true,
                createdAt: true,
                activatedAt: true,
                school: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 500,
        });
    }

    // ── Explanation ───────────────────────────────────────────────────────────

    /**
     * The dates the assigner *would* try for a student, with the seat position
     * of each, without booking anything.
     *
     * This exists because "why did this student get the 12th and not the 5th?"
     * is the question an admin actually asks, and the honest answer is a list of
     * the earlier dates and how full each was.
     */
    async explain(userId: string, examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { id: true, isTrial: true, requiresSlot: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true, activatedAt: true },
        });
        if (!user) throw new NotFoundException('Student not found');

        const registeredAt = user.activatedAt ?? user.createdAt;
        const rules = this.rulesFor(instance, registeredAt);
        const dates = candidateDates(rules);

        const steps = [];
        for (const candidate of dates) {
            const timings = await this.timings.timingsForWeekday(instance.id, candidate.weekday);
            const slots = await this.prisma.examSlot.findMany({
                where: { slotDate: candidate.date, examInstanceId: instance.id },
                select: { id: true, label: true, startsAt: true, capacity: true, booked: true },
                orderBy: { startsAt: 'asc' },
            });
            steps.push({
                date: candidate.date,
                weekday: weekdayName(candidate.weekday),
                daysFromRegistration: candidate.daysFromRegistration,
                preferenceRank: candidate.preferenceRank,
                withinExamWindow: this.dateFitsExamWindow(candidate, instance),
                timingCount: timings.length,
                sittings: slots,
                seatsFree: slots.reduce((n, s) => n + Math.max(0, s.capacity - s.booked), 0),
            });
        }

        return { registeredAt, rules: { ...rules, dayPreferenceNames: rules.dayPreference.map(weekdayName) }, steps };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Practice papers and the trial rehearsal never run to a timetable, and an
     * exam with `requiresSlot: false` has had its gate waived — none of them get
     * a sitting. This is the single predicate the whole slot system asks; the
     * exam list and the start gate must agree with it.
     */
    private needsSlot(exam: { id: string; isTrial: boolean; requiresSlot: boolean }): boolean {
        return !exam.isTrial && !isDemoExam(exam.id) && exam.requiresSlot !== false;
    }

    /** Instance ids of published, non-archived exams that use sittings. */
    private async slotBearingInstances(): Promise<string[]> {
        const now = new Date();
        const instances = await this.prisma.examInstance.findMany({
            where: {
                endsAt: { gt: now },
                exam: {
                    isArchived: false,
                    isTrial: false,
                    requiresSlot: true,
                    isPublished: true,
                },
            },
            select: { id: true, examId: true },
        });
        return instances.filter((i) => !isDemoExam(i.examId)).map((i) => i.id);
    }

    private rulesFor(
        instance: { slotLeadDays: number; slotHorizonDays: number; slotDayPreference: number[] },
        registeredAt: Date,
    ): SearchRules {
        return {
            registeredAt,
            leadDays: instance.slotLeadDays,
            horizonDays: instance.slotHorizonDays,
            dayPreference: instance.slotDayPreference,
        };
    }

    /** A candidate day is usable only if the exam is open on it. */
    private dateFitsExamWindow(
        candidate: CandidateDate,
        instance: { startsAt: Date; endsAt: Date },
    ): boolean {
        // Compare whole IST days: a sitting on the exam's closing day is fine
        // even though midnight that morning is before some of the window.
        const day = candidate.date.getTime();
        return day >= istStartOfDay(instance.startsAt).getTime() && day <= instance.endsAt.getTime();
    }

    private unassigned(
        examInstanceId: string,
        reason: UnassignedReason,
        rules: SearchRules,
        datesConsidered: number,
    ): AssignmentResult {
        return {
            status: 'UNASSIGNED',
            examInstanceId,
            reason,
            message: unassignedMessage(reason, rules),
            datesConsidered,
        };
    }
}
