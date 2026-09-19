import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ExamSlot, SlotTiming } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotTimingDto, UpdateSlotTimingDto } from './dto/slot.dto';
import {
    formatMinuteOfDay,
    istStartOfDay,
    parseMinuteOfDay,
    slotWindow,
    weekdayName,
} from './slot-assignment.rules';

/**
 * The admin-managed catalogue of recurring sitting times, and the one place
 * concrete `ExamSlot` rows are brought into existence from it.
 *
 * Timings are the only slot object an admin normally touches: "Sundays and
 * Saturdays, 10:00–12:00, 50 seats" is one row here and every dated sitting
 * follows from it. Materialisation is lazy — a sitting exists once someone is
 * actually assigned to that date — so an instance running for a year does not
 * carry a hundred empty rows for dates no student was ever offered.
 */
@Injectable()
export class SlotTimingService {
    constructor(private prisma: PrismaService) {}

    // ── Catalogue CRUD ────────────────────────────────────────────────────────

    async list(examInstanceId: string) {
        const timings = await this.prisma.slotTiming.findMany({
            where: { examInstanceId },
            orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }],
        });
        return timings.map((t) => this.decorate(t));
    }

    async create(dto: CreateSlotTimingDto) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: dto.examInstanceId },
            select: { id: true },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const { startMinute, endMinute } = this.parseWindow(dto.startTime, dto.endTime);
        const priority = dto.priority ?? 1;

        const timing = await this.prisma.slotTiming.create({
            data: {
                examInstanceId: dto.examInstanceId,
                label: dto.label ?? null,
                startMinute,
                endMinute,
                capacity: dto.capacity ?? 50,
                weekdays: dto.weekdays ?? [0, 6],
                priority,
                isActive: dto.isActive ?? true,
                sortOrder: dto.sortOrder ?? startMinute,
            },
        });

        // A published calendar may already have dates at this priority waiting
        // for a timing to run — this one now qualifies, so open its sittings
        // immediately rather than leaving the scheduling page to show nothing
        // until the first student happens to be placed on it.
        await this.materializeCalendar(dto.examInstanceId);

        return this.decorate(timing);
    }

    async update(timingId: string, dto: UpdateSlotTimingDto) {
        const timing = await this.prisma.slotTiming.findUnique({ where: { id: timingId } });
        if (!timing) throw new NotFoundException('Slot timing not found');

        const startTime = dto.startTime ?? formatMinuteOfDay(timing.startMinute);
        const endTime = dto.endTime ?? formatMinuteOfDay(timing.endMinute);
        const { startMinute, endMinute } = this.parseWindow(startTime, endTime);

        const updated = await this.prisma.slotTiming.update({
            where: { id: timingId },
            data: {
                ...(dto.label !== undefined && { label: dto.label || null }),
                ...(dto.startTime !== undefined && { startMinute }),
                ...(dto.endTime !== undefined && { endMinute }),
                ...(dto.capacity !== undefined && { capacity: dto.capacity }),
                ...(dto.weekdays !== undefined && { weekdays: this.normaliseWeekdays(dto.weekdays) }),
                ...(dto.priority !== undefined && { priority: dto.priority }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
                ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
            },
        });

        // Sittings that already exist keep the times and seats they were created
        // with. Rewriting them would move an appointment students have already
        // been told about — and could push `capacity` below `booked`. Editing a
        // timing changes what happens *next*; moving an existing sitting is a
        // separate, deliberate act on that sitting.
        const materialised = await this.prisma.examSlot.count({
            where: { timingId, slotDate: { gte: istStartOfDay(new Date()) } },
        });

        return {
            ...this.decorate(updated),
            /**
             * Surfaced so the admin UI can say so plainly rather than leaving
             * them to discover that today's edit did not move next Sunday.
             */
            existingUpcomingSittings: materialised,
        };
    }

    /**
     * Removes a timing. Sittings already materialised from it survive — students
     * are booked into them — but are detached (`timingId → null`) so they stop
     * looking like part of a schedule that no longer exists.
     *
     * A timing with booked sittings can only be *deactivated*, not deleted:
     * deleting is for a timing added by mistake, and silently orphaning a
     * cohort's appointments is not something a delete button should be able to do.
     */
    async remove(timingId: string) {
        const timing = await this.prisma.slotTiming.findUnique({ where: { id: timingId } });
        if (!timing) throw new NotFoundException('Slot timing not found');

        const booked = await this.prisma.examSlot.aggregate({
            where: { timingId },
            _sum: { booked: true },
        });
        if ((booked._sum.booked ?? 0) > 0) {
            throw new BadRequestException(
                'Students are already assigned to sittings from this timing. Deactivate it instead — that stops new assignments without moving anyone.',
            );
        }

        // Empty sittings from a deleted timing have no reason to survive it.
        await this.prisma.examSlot.deleteMany({ where: { timingId, booked: 0 } });
        await this.prisma.slotTiming.delete({ where: { id: timingId } });
        return { success: true };
    }

    // ── Materialisation ───────────────────────────────────────────────────────

    /**
     * The active timings for an instance that run on a given IST weekday, in
     * preference order (`sortOrder`, then earliest start).
     */
    async timingsForWeekday(examInstanceId: string, weekday: number): Promise<SlotTiming[]> {
        const timings = await this.prisma.slotTiming.findMany({
            where: { examInstanceId, isActive: true, weekdays: { has: weekday } },
            orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }],
        });
        return timings;
    }

    /**
     * The active timings for a calendar tier, earliest first.
     *
     * The tier, not the weekday, is what selects the times once an exam
     * publishes a calendar: a tier-2 Saturday runs only the two evening
     * sittings, and asking by weekday would hand it all seven.
     *
     * Ordering is earliest-start-first rather than by `sortOrder`, because on a
     * published day the fill order *is* the clock: 8.30 fills before 10.00
     * before 11.30. `sortOrder` remains the tie-break for two timings that start
     * together — overlapping same-tier sittings are allowed, so this is a real
     * ordering decision rather than a formality.
     */
    async timingsForPriority(examInstanceId: string, priority: number): Promise<SlotTiming[]> {
        return this.prisma.slotTiming.findMany({
            where: { examInstanceId, isActive: true, priority },
            orderBy: [{ startMinute: 'asc' }, { sortOrder: 'asc' }],
        });
    }

    /**
     * The timing a given tier already runs at a given start time, if any.
     *
     * This is the reuse check behind adding a date "with its timings": a
     * second Sunday added at Priority 1, 11:00 must land on the *same*
     * `SlotTiming` the first Sunday's 11:00 created, not a duplicate that
     * would silently double that hour's real capacity across the season.
     */
    async findByPriorityAndStart(
        examInstanceId: string,
        priority: number,
        startTime: string,
    ): Promise<SlotTiming | null> {
        const startMinute = parseMinuteOfDay(startTime);
        if (startMinute === null) return null;
        return this.prisma.slotTiming.findFirst({
            where: { examInstanceId, priority, startMinute },
        });
    }

    /**
     * The sitting for `(timing, date)`, creating it if it does not exist yet.
     *
     * Two students registering at the same moment can both find nothing and both
     * try to create it, so the unique index on `(timingId, slotDate)` is the
     * arbiter: whoever loses the race re-reads the winner's row. Returning a
     * shared row is the correct outcome — they are meant to be in the same
     * sitting — and it is what keeps the capacity guard meaningful, since two
     * duplicate rows would each hand out a full 50 seats.
     */
    async ensureSlot(timing: SlotTiming, slotDate: Date): Promise<ExamSlot> {
        const existing = await this.prisma.examSlot.findFirst({
            where: { timingId: timing.id, slotDate },
        });
        if (existing) return existing;

        const { startsAt, endsAt } = slotWindow(slotDate, timing.startMinute, timing.endMinute);

        try {
            return await this.prisma.examSlot.create({
                data: {
                    examInstanceId: timing.examInstanceId,
                    timingId: timing.id,
                    slotDate,
                    label: timing.label,
                    startsAt,
                    endsAt,
                    capacity: timing.capacity,
                },
            });
        } catch {
            // Lost the create race — the winner's row is the one to use.
            const raced = await this.prisma.examSlot.findFirst({
                where: { timingId: timing.id, slotDate },
            });
            if (!raced) throw new BadRequestException('Could not open a sitting for that date.');
            return raced;
        }
    }

    /**
     * Opens every sitting a published calendar implies — every active
     * `ExamScheduleDate` paired with the timings its tier runs — instead of
     * waiting for a student to be placed on each one first.
     *
     * The lazy path (`ensureSlot`, called from the assigner) exists so a season
     * with a year of dates does not carry rows nobody will ever fill. That
     * reasoning does not apply to a calendar an admin has just published: they
     * are about to look at the scheduling page to check it, and "the calendar
     * you just built shows nothing" reads as broken even though it is working
     * as designed. So this runs automatically after every write that could
     * complete a (date, timing) pairing — adding a date, adding a timing,
     * seeding the standard season — and is also exposed standalone so an admin
     * can force a re-sync (the one thing a script used to be needed for).
     *
     * Idempotent and safe to re-run: `ensureSlot` no-ops on a pairing that
     * already has a row, so calling this after every small edit costs nothing
     * extra beyond the first time each pairing is opened.
     */
    async materializeCalendar(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: { startsAt: true, endsAt: true },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const dates = await this.prisma.examScheduleDate.findMany({
            where: { examInstanceId, isActive: true },
            select: { date: true, priority: true },
        });

        let opened = 0;
        let alreadyOpen = 0;
        let outsideWindow = 0;

        for (const d of dates) {
            const timings = await this.timingsForPriority(examInstanceId, d.priority);
            for (const timing of timings) {
                const { startsAt, endsAt } = slotWindow(d.date, timing.startMinute, timing.endMinute);
                // A pairing that could never be sat -- its window falls outside
                // the exam's own -- is exactly what the assigner itself refuses
                // to materialise, so this mirrors that rather than opening a
                // sitting nobody could ever be placed into.
                if (startsAt < instance.startsAt || endsAt > instance.endsAt) {
                    outsideWindow += 1;
                    continue;
                }
                const existing = await this.prisma.examSlot.findFirst({
                    where: { timingId: timing.id, slotDate: d.date },
                    select: { id: true },
                });
                await this.ensureSlot(timing, d.date);
                if (existing) alreadyOpen += 1;
                else opened += 1;
            }
        }

        return { datesChecked: dates.length, opened, alreadyOpen, outsideWindow };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private parseWindow(startTime: string, endTime: string) {
        const startMinute = parseMinuteOfDay(startTime);
        const endMinute = parseMinuteOfDay(endTime);
        if (startMinute === null || endMinute === null) {
            throw new BadRequestException('Times must be in HH:mm 24-hour format (IST).');
        }
        if (startMinute === endMinute) {
            throw new BadRequestException('A sitting must be longer than zero minutes.');
        }
        return { startMinute, endMinute };
    }

    private normaliseWeekdays(weekdays: number[]): number[] {
        return [...new Set(weekdays.map((d) => ((d % 7) + 7) % 7))].sort((a, b) => a - b);
    }

    /** Adds the display fields every consumer would otherwise recompute. */
    private decorate(timing: SlotTiming) {
        return {
            ...timing,
            startTime: formatMinuteOfDay(timing.startMinute),
            endTime: formatMinuteOfDay(timing.endMinute),
            weekdayNames: timing.weekdays.map(weekdayName),
        };
    }
}
