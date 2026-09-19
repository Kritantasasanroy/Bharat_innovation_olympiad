import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateScheduleDateDto,
    CreateScheduleDateWithTimingsDto,
    UpdateScheduleDateDto,
} from './dto/slot.dto';
import {
    BIO_2026_CALENDAR,
    CALENDAR_TIMES,
    DEFAULT_SITTING_CAPACITY,
    DEFAULT_SITTING_MINUTES,
} from './slot-calendar';
import { istStartOfDay, istWeekday, parseMinuteOfDay, weekdayName } from './slot-assignment.rules';
import { SlotService } from './slot.service';
import { SlotTimingService } from './slot-timing.service';

/**
 * The published list of days an exam runs, and the one-click seed that creates
 * a season's worth of them.
 *
 * A date's sittings open automatically the moment both halves of the pairing
 * exist -- see `SlotTimingService.materializeCalendar`, which every write path
 * here calls. They are not, however, pre-created for a date that has no
 * matching timing yet: a season carrying dates nobody has put a timing behind
 * costs only those small date rows, nothing else.
 */
@Injectable()
export class SlotScheduleDateService {
    constructor(
        private prisma: PrismaService,
        private timings: SlotTimingService,
        private slots: SlotService,
    ) {}

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

        const created = await this.prisma.examScheduleDate.create({
            data: {
                examInstanceId: dto.examInstanceId,
                date,
                priority: dto.priority ?? 1,
                isActive: dto.isActive ?? true,
                note: dto.note ?? null,
            },
        });

        // If a timing already exists for this date's tier, its sitting opens
        // right away — an admin adding "22 Sep, Priority 1" to an exam that
        // already has Priority 1 timings should see it on the schedule
        // immediately, not the first time a student registers.
        await this.timings.materializeCalendar(dto.examInstanceId);

        return created;
    }

    /**
     * A date, with the sittings that run on it -- the way an admin actually
     * thinks about scheduling, in one call.
     *
     * The catalogue underneath is still `SlotTiming`, keyed by
     * `(priority, startMinute)`: a second date added at the same priority
     * reuses whatever timing already exists at a given time rather than
     * creating a duplicate. That reuse is what makes "the next Sunday
     * automatically runs the same sitting times" work without re-entering
     * them -- but it means a shared timing's *default* capacity is set by
     * whichever date created it first. Each date's own seat count is never
     * left to that default: after the sitting opens, its capacity is set
     * explicitly to what *this* date asked for, through the same guarded path
     * (`SlotService.updateSitting`) the scheduling page uses -- so it inherits
     * the same refusal to cut capacity below students already seated.
     */
    async createWithTimings(dto: CreateScheduleDateWithTimingsDto) {
        const dateRow = await this.create({
            examInstanceId: dto.examInstanceId,
            date: dto.date,
            priority: dto.priority,
            note: dto.note,
        });

        const sittings = [];
        for (const t of dto.timings) {
            let timing = await this.timings.findByPriorityAndStart(
                dto.examInstanceId,
                dateRow.priority,
                t.startTime,
            );
            if (!timing) {
                timing = await this.timings.create({
                    examInstanceId: dto.examInstanceId,
                    label: t.label,
                    startTime: t.startTime,
                    endTime: t.endTime,
                    capacity: t.seats,
                    priority: dateRow.priority,
                });
            }

            const slot = await this.timings.ensureSlot(timing, dateRow.date);
            const sitting =
                slot.capacity === t.seats
                    ? slot
                    : await this.slots.updateSitting(slot.id, { capacity: t.seats });
            sittings.push(sitting);
        }

        return { date: dateRow, sittings };
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

        // Reopening a date, or moving it to a tier that now has timings, can
        // complete a pairing the same way adding a fresh date does.
        await this.timings.materializeCalendar(existing.examInstanceId);

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
     * `capacityOverride` sets the seats per sitting for every timing the seed
     * creates, in place of the season default. It applies only to timings this
     * call actually creates: an idempotent re-run that adds nothing also
     * re-seats nothing, so an admin who seeded at 50 and re-runs with 80 does
     * not silently resize the sittings already in use — that stays an explicit
     * edit on the scheduling page.
     *
     * Idempotent by construction: a date or timing that already exists is left
     * alone rather than duplicated, so an admin who clicks this twice, or who
     * seeds an instance that was half-configured by hand, ends up with exactly
     * one of each. That matters more than it sounds — a duplicated timing would
     * open a second 50-seat sitting at the same hour and quietly double the
     * day's capacity.
     */
    async seedStandardCalendar(examInstanceId: string, capacityOverride?: number) {
        const capacity =
            capacityOverride && capacityOverride > 0
                ? capacityOverride
                : DEFAULT_SITTING_CAPACITY;
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
                    capacity,
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

        // Every date and timing the season needs now exists — open their
        // sittings in the same call, so "Load published season" leaves the
        // scheduling page showing the whole calendar rather than an empty grid
        // that only fills in as students happen to register.
        const materialised = await this.timings.materializeCalendar(examInstanceId);

        return {
            datesAdded: newDates.length,
            datesAlreadyPresent: BIO_2026_CALENDAR.length - newDates.length,
            timingsAdded: wanted.length,
            sittingsOpened: materialised.opened,
        };
    }
}
