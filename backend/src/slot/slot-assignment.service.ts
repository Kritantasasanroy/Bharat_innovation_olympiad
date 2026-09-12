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
    CalendarCandidate,
    CandidateDate,
    ScheduleDay,
    SearchRules,
    UnassignedReason,
    addDays,
    calendarCandidates,
    candidateDates,
    examNeedsSlot,
    istStartOfDay,
    slotWindow,
    unassignedMessage,
    weekdayName,
    windowsOverlap,
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
    /** The tier the sitting came from, when the exam runs a published calendar. */
    priority?: number;
}

/**
 * The ordered list of days to try for one student, and how it was arrived at.
 *
 * Two sources produce one of these. An instance with a published calendar
 * (`ExamScheduleDate` rows) uses that, in priority-then-date order. One without
 * falls back to the weekday search that predates the calendar, so exams
 * configured before it keep behaving exactly as they did.
 */
interface PlacementPlan {
    candidates: (CandidateDate & { priority?: number })[];
    usesCalendar: boolean;
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
        const plan = await this.buildPlan(instance.id, rules);
        if (plan.candidates.length === 0) {
            return this.unassigned(
                instance.id,
                plan.usesCalendar ? 'NO_SCHEDULE_DATES' : 'NO_CANDIDATE_DATES',
                rules,
                0,
            );
        }

        // A sitting outside the exam instance's own window could never be sat:
        // the phase gate refuses to start an exam before it opens or after it
        // closes, no matter what the student's slot says.
        const inWindow = plan.candidates.filter((d) => this.dateFitsExamWindow(d, instance));
        if (inWindow.length === 0) {
            return this.unassigned(
                instance.id,
                'OUTSIDE_EXAM_WINDOW',
                rules,
                plan.candidates.length,
            );
        }

        // The lead time survives the move to a published calendar, but as a
        // *preference* rather than a filter. A student registering four days
        // before the last Sunday of the season would otherwise be barred from
        // every remaining date and left with no sitting at all -- the one
        // outcome the calendar exists to prevent. So the dates a fortnight or
        // more out are offered first, in priority order, and only if every one
        // of those is full does the search fall back to the nearer ones.
        const earliest = addDays(istStartOfDay(rules.registeredAt), rules.leadDays);
        const passes = plan.usesCalendar
            ? [
                  inWindow.filter((d) => d.date >= earliest),
                  inWindow.filter((d) => d.date < earliest),
              ]
            : // The legacy weekday search bakes the lead into the dates it
              // produces, so there is nothing left to split.
              [inWindow];

        let sawAnyTiming = false;
        // A timing exists for the day but every one of its sittings was pushed
        // out by the exam's own window or by having already started. That is a
        // different problem from "full", and telling an admin to add seats when
        // the real fix is to widen the exam window would send them the wrong way.
        let sawOnlyUnusable = true;
        let sawCollision = false;
        let tried = 0;
        const now = new Date();

        for (const pass of passes) {
            for (const candidate of pass) {
                tried += 1;
                const timings = plan.usesCalendar
                    ? await this.timings.timingsForPriority(instance.id, candidate.priority ?? 1)
                    : await this.timings.timingsForWeekday(instance.id, candidate.weekday);
                if (timings.length === 0) continue;
                sawAnyTiming = true;

                for (const timing of timings) {
                    // Work out the real instants *before* materialising anything. A
                    // sitting that has already started is a worthless seat, and one
                    // that falls outside the exam's own window could never be sat --
                    // creating either would leave a permanently unusable row behind
                    // and make the sittings list lie about what is on offer.
                    const when = slotWindow(candidate.date, timing.startMinute, timing.endMinute);
                    if (when.startsAt <= now) continue;
                    if (when.startsAt < instance.startsAt || when.endsAt > instance.endsAt) continue;

                    sawOnlyUnusable = false;

                    // A participant sitting another exam at this hour cannot sit
                    // this one. Checked before the row is materialised, so a clash
                    // does not leave an empty sitting behind on a date nobody used.
                    if (await this.collidesWithExistingBooking(userId, instance.id, when)) {
                        sawCollision = true;
                        continue;
                    }

                    const slot = await this.timings.ensureSlot(timing, candidate.date);
                    const bookingId = await this.claimSeat(userId, slot, assignedBy);
                    if (!bookingId) continue;

                    return {
                        status: 'ASSIGNED',
                        examInstanceId: instance.id,
                        bookingId,
                        slotId: slot.id,
                        slotStartsAt: slot.startsAt,
                        datesConsidered: tried,
                        priority: candidate.priority,
                    };
                }
            }
        }

        let reason: UnassignedReason;
        if (!sawAnyTiming) reason = 'NO_TIMINGS';
        else if (sawOnlyUnusable) reason = 'OUTSIDE_EXAM_WINDOW';
        else if (sawCollision) reason = 'CLASHES_WITH_ANOTHER_EXAM';
        else reason = 'ALL_FULL';

        return this.unassigned(instance.id, reason, rules, tried);
    }

    /**
     * The days to try, from the published calendar when there is one.
     *
     * Dates already past are dropped inside `calendarCandidates`, so a season
     * half over does not make every placement walk a month of dead Sundays
     * before it reaches a live one.
     */
    private async buildPlan(examInstanceId: string, rules: SearchRules): Promise<PlacementPlan> {
        const days = await this.prisma.examScheduleDate.findMany({
            where: { examInstanceId },
            select: { date: true, priority: true, isActive: true },
            orderBy: [{ priority: 'asc' }, { date: 'asc' }],
        });

        if (days.length === 0) {
            return { candidates: candidateDates(rules), usesCalendar: false };
        }

        const candidates: CalendarCandidate[] = calendarCandidates(
            days as ScheduleDay[],
            rules.registeredAt,
            new Date(),
        );
        return { candidates, usesCalendar: true };
    }

    /**
     * Does this sitting clash with one the participant already holds?
     *
     * Other exams only -- a second booking for the same instance is impossible
     * by the time this runs, and comparing an instance against itself would have
     * every student collide with their own seat.
     *
     * This is the "no two sittings collide" rule. Two exams a class takes can
     * legitimately fall on the same Sunday; what they must not do is overlap in
     * time, because one participant cannot sit both. The comparison is half-open,
     * so the 10:00-11:30 paper and the 11:30-13:00 one are back to back rather
     * than in conflict -- which matters, because the whole published schedule
     * runs on that 90-minute cadence.
     */
    private async collidesWithExistingBooking(
        userId: string,
        examInstanceId: string,
        when: { startsAt: Date; endsAt: Date },
    ): Promise<boolean> {
        const clash = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: {
                    examInstanceId: { not: examInstanceId },
                    startsAt: { lt: when.endsAt },
                    endsAt: { gt: when.startsAt },
                },
            },
            select: { id: true },
        });
        return clash !== null;
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
     *
     * `target` is either an existing sitting (`slotId`) or one that has never
     * been opened yet (`timingId` + `date`) — the admin's calendar shows every
     * configured date whether or not anyone has been placed on it, and picking
     * one nobody has used yet must not be a dead end.
     */
    async reassign(
        userId: string,
        target: { slotId?: string; timingId?: string; date?: string },
        adminId: string,
    ) {
        const slotId = target.slotId ?? (await this.resolveOrOpenSlot(target));
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

        // An admin moving someone by hand is still subject to the one rule the
        // auto-assigner cannot bend: a participant cannot be in two places at
        // once. Reported as a conflict rather than silently allowed, because the
        // clash is with a booking on a *different* exam that this screen does
        // not show -- so an admin would have no way to see what they had broken.
        if (await this.collidesWithExistingBooking(userId, slot.examInstanceId, slot)) {
            throw new ConflictException(
                'This participant already sits another exam at that time. Move that booking first, or pick a sitting at a different hour.',
            );
        }

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
     * Turns a `{timingId, date}` pair into a real sitting id, opening it via
     * `ensureSlot` if this is the first time anyone has been placed on it.
     *
     * This is the same materialisation the auto-assigner uses, run on demand
     * for an admin's manual pick — the calendar and timings panels show every
     * configured date and time whether or not a sitting has ever been opened
     * on it, and an admin choosing one nobody has used yet must land on the
     * same row a student registering that day would.
     */
    private async resolveOrOpenSlot(target: {
        timingId?: string;
        date?: string;
    }): Promise<string> {
        if (!target.timingId || !target.date) {
            throw new BadRequestException(
                'Provide either an existing sitting, or a timing and a date to open one on.',
            );
        }

        const timing = await this.prisma.slotTiming.findUnique({ where: { id: target.timingId } });
        if (!timing) throw new NotFoundException('Slot timing not found');

        const instance = await this.prisma.examInstance.findUnique({
            where: { id: timing.examInstanceId },
            select: { startsAt: true, endsAt: true },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const day = istStartOfDay(new Date(`${target.date.slice(0, 10)}T00:00:00+05:30`));
        const when = slotWindow(day, timing.startMinute, timing.endMinute);
        if (when.startsAt < instance.startsAt || when.endsAt > instance.endsAt) {
            throw new BadRequestException(
                'That sitting would fall outside the exam’s own window, so it cannot be opened.',
            );
        }

        const slot = await this.timings.ensureSlot(timing, day);
        return slot.id;
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

    /**
     * Runs the backfill across every exam that uses sittings.
     *
     * This is the "everyone gets a date" guarantee made operational. Three
     * things leave a participant unscheduled and none of them are their fault:
     * they registered before the calendar existed, every sitting was full at the
     * moment they signed up, or the exam itself was created after they had
     * already registered. All three are fixed by the same sweep, which is why it
     * is one method and not three.
     *
     * Idempotent and safe to run repeatedly -- a participant who already holds a
     * seat is skipped by the query, not re-placed.
     */
    async backfillAll() {
        const instances = await this.slotBearingInstances();
        const perInstance: {
            examInstanceId: string;
            considered: number;
            assigned: number;
            unassigned: number;
        }[] = [];

        for (const instanceId of instances) {
            try {
                const result = await this.backfillInstance(instanceId);
                perInstance.push({
                    examInstanceId: instanceId,
                    considered: result.considered,
                    assigned: result.assigned,
                    unassigned: result.unassigned,
                });
            } catch (err) {
                this.logger.error(
                    `Backfill failed for instance ${instanceId}: ${(err as Error).message}`,
                );
            }
        }

        return {
            instances: perInstance.length,
            assigned: perInstance.reduce((n, r) => n + r.assigned, 0),
            stillUnassigned: perInstance.reduce((n, r) => n + r.unassigned, 0),
            perInstance,
        };
    }

    /** Students of an instance with no sitting, for the admin's attention list. */
    async listUnassigned(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: {
                exam: { select: { id: true, isTrial: true, requiresSlot: true, classBands: true } },
            },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        // An exam exempt from sittings (trial, demo, or `requiresSlot: false`)
        // has no one "unassigned" — every eligible student is correctly
        // NOT_APPLICABLE and always will be. Without this check every such
        // exam showed its whole eligible roster as unscheduled forever: a list
        // that can never shrink, on a "Schedule everyone" button that can only
        // ever refuse with "this exam does not use sittings."
        if (!this.needsSlot(instance.exam)) return [];

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
        const plan = await this.buildPlan(instance.id, rules);
        const dates = plan.candidates;

        const steps = [];
        for (const candidate of dates) {
            const timings = plan.usesCalendar
                ? await this.timings.timingsForPriority(instance.id, candidate.priority ?? 1)
                : await this.timings.timingsForWeekday(instance.id, candidate.weekday);
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
                priority: candidate.priority ?? null,
                withinExamWindow: this.dateFitsExamWindow(candidate, instance),
                timingCount: timings.length,
                sittings: slots,
                seatsFree: slots.reduce((n, s) => n + Math.max(0, s.capacity - s.booked), 0),
            });
        }

        return {
            registeredAt,
            usesPublishedCalendar: plan.usesCalendar,
            rules: { ...rules, dayPreferenceNames: rules.dayPreference.map(weekdayName) },
            steps,
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Practice papers and the trial rehearsal never run to a timetable, and an
     * exam with `requiresSlot: false` has had its gate waived — none of them get
     * a sitting. Delegates to the shared predicate in `slot-assignment.rules`
     * so every other consumer (the analytics dashboard, the admin unassigned
     * list) reads the same answer this service does.
     */
    private needsSlot(exam: { id: string; isTrial: boolean; requiresSlot: boolean }): boolean {
        return examNeedsSlot(exam);
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
