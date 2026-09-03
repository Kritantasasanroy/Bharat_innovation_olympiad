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

        const timing = await this.prisma.slotTiming.create({
            data: {
                examInstanceId: dto.examInstanceId,
                label: dto.label ?? null,
                startMinute,
                endMinute,
                capacity: dto.capacity ?? 50,
                weekdays: dto.weekdays ?? [0, 6],
                isActive: dto.isActive ?? true,
                sortOrder: dto.sortOrder ?? 0,
            },
        });
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
