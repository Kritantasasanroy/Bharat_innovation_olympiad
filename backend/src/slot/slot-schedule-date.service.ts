import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDateDto, UpdateScheduleDateDto } from './dto/slot.dto';
import {
    BIO_2026_CALENDAR,
    CALENDAR_TIMES,
    DEFAULT_SITTING_CAPACITY,
    DEFAULT_SITTING_MINUTES,
} from './slot-calendar';
import { istStartOfDay, istWeekday, parseMinuteOfDay, weekdayName } from './slot-assignment.rules';

/**
 * The published list of days an exam runs, and the one-click seed that creates
 * a season's worth of them.
 *
 * A date here is a *promise*, not a materialised sitting: the dated `ExamSlot`
 * rows are still created lazily by the assigner, so an instance carrying all
 * seventy-two of the season's sittings costs seventy-two small rows here and
 * nothing else until students actually need seats.
 */
@Injectable()
export class SlotScheduleDateService {
    constructor(private prisma: PrismaService) {}

    /**
     * Parses a `YYYY-MM-DD` into the canonical midnight-IST instant.
     *
     * Going through an explicit `+05:30` rather than trusting
     * `new Date('2026-09-27')` matters: that parses as midnight **UTC**, which is
     * 05:30 IST on the 27th — the right day by luck, but the wrong instant, and
     * it would never match the `slotDate` the assigner writes.
     */
    private toIstDay(value: string | Date): Date {
        const parsed =
            typeof value === 'string'
                ? new Date(`${value.slice(0, 10)}T00:00:00+05:30`)
                : value;
        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException('Dates must be YYYY-MM-DD.');
        }
        return istStartOfDay(parsed);
    }

    async list(examInstanceId: string) {
        const dates = await this.prisma.examScheduleDate.findMany({
            where: { examInstanceId },
            orderBy: [{ priority: 'asc' }, { date: 'asc' }],
        });
        return dates.map((d) => ({ ...d, weekday: weekdayName(istWeekday(d.date)) }));
    }

    async create(dto: CreateScheduleDateDto) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: dto.examInstanceId },
            select: { id: true },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const date = this.toIstDay(dto.date);
        const clash = await this.prisma.examScheduleDate.findFirst({
            where: { examInstanceId: dto.examInstanceId, date },
        });
        if (clash) {
            throw new BadRequestException('That date is already on this exam calendar.');
        }

        return this.prisma.examScheduleDate.create({
            data: {
                examInstanceId: dto.examInstanceId,
                date,
                priority: dto.priority ?? 1,
                isActive: dto.isActive ?? true,
                note: dto.note ?? null,
            },
        });
    }

    async update(id: string, dto: UpdateScheduleDateDto) {
        const existing = await this.prisma.examScheduleDate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Schedule date not found');

        // Turning a date off, or moving it, must not silently strand students
        // already sitting on it. Those bookings live on real `ExamSlot` rows and
        // are unaffected by this table; reporting the number is more useful than
        // blocking the edit, since "stop putting *new* students here" is exactly
        // what an admin means when they deactivate a date mid-season.
        const seated = await this.prisma.examSlot.aggregate({
            where: { examInstanceId: existing.examInstanceId, slotDate: existing.date },
            _sum: { booked: true },
        });

        const updated = await this.prisma.examScheduleDate.update({
            where: { id },
            data: {
                ...(dto.date !== undefined && { date: this.toIstDay(dto.date) }),
                ...(dto.priority !== undefined && { priority: dto.priority }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
                ...(dto.note !== undefined && { note: dto.note || null }),
            },
        });

        return { ...updated, studentsAlreadySeatedOnOldDate: seated._sum.booked ?? 0 };
    }

    /**
     * Removes a date from the calendar. Refused once students sit on it —
     * deactivating is the way to close a date to new assignments without
     * pretending the people already on it are not there.
     */
    async remove(id: string) {
        const existing = await this.prisma.examScheduleDate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Schedule date not found');

        const seated = await this.prisma.examSlot.aggregate({
            where: { examInstanceId: existing.examInstanceId, slotDate: existing.date },
            _sum: { booked: true },
        });
        if ((seated._sum.booked ?? 0) > 0) {
            throw new BadRequestException(
                `${seated._sum.booked} participant(s) are already sitting on this date. Deactivate it instead — that stops new assignments without moving anyone.`,
            );
        }

        await this.prisma.examScheduleDate.delete({ where: { id } });
        return { success: true };
    }

    /**
     * Creates the season's published calendar — dates *and* the timings that go
     * with each tier — in one go.
     *
     * Idempotent by construction: a date or timing that already exists is left
     * alone rather than duplicated, so an admin who clicks this twice, or who
     * seeds an instance that was half-configured by hand, ends up with exactly
     * one of each. That matters more than it sounds — a duplicated timing would
     * open a second 50-seat sitting at the same hour and quietly double the
     * day's capacity.
     */
    async seedStandardCalendar(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: { id: true },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const existingDates = await this.prisma.examScheduleDate.findMany({
            where: { examInstanceId },
            select: { date: true },
        });
        const haveDate = new Set(existingDates.map((d) => d.date.getTime()));

        const newDates = BIO_2026_CALENDAR.map((d) => ({
            examInstanceId,
            date: this.toIstDay(d.date),
            priority: d.priority,
            isActive: d.isActive ?? true,
            note: d.note ?? null,
        })).filter((d) => !haveDate.has(d.date.getTime()));

        if (newDates.length) {
            await this.prisma.examScheduleDate.createMany({ data: newDates });
        }

        const existingTimings = await this.prisma.slotTiming.findMany({
            where: { examInstanceId },
            select: { startMinute: true, priority: true },
        });
        const haveTiming = new Set(existingTimings.map((t) => `${t.priority}@${t.startMinute}`));

        const wanted: {
            examInstanceId: string;
            label: string;
            startMinute: number;
            endMinute: number;
            capacity: number;
            weekdays: number[];
            priority: number;
            sortOrder: number;
        }[] = [];
        for (const priority of [1, 2]) {
            const times = CALENDAR_TIMES.filter((t) => t.priorities.includes(priority));
            times.forEach((t, i) => {
                const startMinute = parseMinuteOfDay(t.value);
                if (startMinute === null) return;
                if (haveTiming.has(`${priority}@${startMinute}`)) return;
                wanted.push({
                    examInstanceId,
                    label: t.label,
                    startMinute,
                    endMinute: startMinute + DEFAULT_SITTING_MINUTES,
                    capacity: DEFAULT_SITTING_CAPACITY,
                    // Retained only for instances that later drop their calendar
                    // and fall back to the weekday search.
                    weekdays: priority === 1 ? [0] : [6],
                    priority,
                    sortOrder: i,
                });
            });
        }

        if (wanted.length) {
            await this.prisma.slotTiming.createMany({ data: wanted });
        }

        return {
            datesAdded: newDates.length,
            datesAlreadyPresent: BIO_2026_CALENDAR.length - newDates.length,
            timingsAdded: wanted.length,
        };
    }
}
