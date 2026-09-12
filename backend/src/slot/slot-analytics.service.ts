import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatMinuteOfDay, istWeekday, weekdayName } from './slot-assignment.rules';

const ACTIVE_BOOKING = { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] };

/**
 * Everything the slot-management screen draws: how many places the season has
 * configured, how many are taken, and how both break down by day.
 *
 * ## Configured is not the same as materialised
 *
 * Sittings are created lazily — a date has no `ExamSlot` row until somebody is
 * actually put on it — so counting rows would report a season that has not
 * started yet as having *zero* capacity. The configured figure therefore comes
 * from the calendar itself (published dates x the timings their tier runs x the
 * seats each), and the taken figure from the rows that do exist. A day shows
 * both, which is what makes "56 sittings configured, 9 open, 2,800 places, 412
 * taken" a sentence an admin can act on.
 *
 * Capacity an admin has raised on an individual sitting counts for that sitting
 * rather than the timing default, so topping up a busy Sunday is reflected the
 * moment it is done.
 */
@Injectable()
export class SlotAnalyticsService {
    constructor(private prisma: PrismaService) {}

    async forInstance(examInstanceId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: {
                exam: { select: { id: true, title: true, classBands: true, durationMinutes: true } },
            },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const [scheduleDates, timings, slots] = await Promise.all([
            this.prisma.examScheduleDate.findMany({
                where: { examInstanceId },
                orderBy: [{ date: 'asc' }],
            }),
            this.prisma.slotTiming.findMany({
                where: { examInstanceId },
                orderBy: [{ priority: 'asc' }, { startMinute: 'asc' }],
            }),
            this.prisma.examSlot.findMany({
                where: { examInstanceId },
                orderBy: [{ startsAt: 'asc' }],
                select: {
                    id: true,
                    slotDate: true,
                    label: true,
                    startsAt: true,
                    endsAt: true,
                    capacity: true,
                    booked: true,
                    timingId: true,
                },
            }),
        ]);

        // One query for the class breakdown rather than one per day: the
        // calendar is seventy-odd days long and a per-day query would be
        // seventy-odd round trips to draw one chart.
        const bookings = await this.prisma.booking.findMany({
            where: { status: ACTIVE_BOOKING, slot: { examInstanceId } },
            select: {
                slotId: true,
                user: { select: { classBand: true, schoolId: true } },
            },
        });

        const bySlot = new Map<string, { classBands: Map<number, number>; schools: Set<string> }>();
        for (const b of bookings) {
            const row = bySlot.get(b.slotId) ?? { classBands: new Map(), schools: new Set() };
            const band = b.user.classBand;
            if (band !== null) row.classBands.set(band, (row.classBands.get(band) ?? 0) + 1);
            if (b.user.schoolId) row.schools.add(b.user.schoolId);
            bySlot.set(b.slotId, row);
        }

        const activeTimingsByPriority = new Map<number, typeof timings>();
        for (const t of timings) {
            if (!t.isActive) continue;
            const list = activeTimingsByPriority.get(t.priority) ?? [];
            list.push(t);
            activeTimingsByPriority.set(t.priority, list);
        }

        const slotsByDate = new Map<number, typeof slots>();
        for (const slot of slots) {
            const key = slot.slotDate.getTime();
            const list = slotsByDate.get(key) ?? [];
            list.push(slot);
            slotsByDate.set(key, list);
        }

        const days = scheduleDates.map((d) => {
            const tierTimings = activeTimingsByPriority.get(d.priority) ?? [];
            const open = slotsByDate.get(d.date.getTime()) ?? [];
            const openByTiming = new Map(open.filter((s) => s.timingId).map((s) => [s.timingId, s]));

            // Every sitting the day *offers*, whether or not it has been opened
            // yet — the timings its tier runs, plus any one-off sitting an admin
            // created on the day by hand.
            const sittings = tierTimings.map((t) => {
                const materialised = openByTiming.get(t.id);
                return {
                    timingId: t.id,
                    slotId: materialised?.id ?? null,
                    label: materialised?.label ?? t.label,
                    startTime: formatMinuteOfDay(t.startMinute),
                    endTime: formatMinuteOfDay(t.endMinute),
                    startsAt: materialised?.startsAt ?? null,
                    capacity: materialised?.capacity ?? t.capacity,
                    booked: materialised?.booked ?? 0,
                    isOpen: materialised !== undefined,
                };
            });

            const adHoc = open
                .filter((s) => !s.timingId)
                .map((s) => ({
                    timingId: null,
                    slotId: s.id,
                    label: s.label,
                    startTime: null,
                    endTime: null,
                    startsAt: s.startsAt,
                    capacity: s.capacity,
                    booked: s.booked,
                    isOpen: true,
                }));

            const all = [...sittings, ...adHoc];
            const capacity = d.isActive ? all.reduce((n, s) => n + s.capacity, 0) : 0;
            const booked = all.reduce((n, s) => n + s.booked, 0);

            const classBands = new Map<number, number>();
            const schools = new Set<string>();
            for (const s of open) {
                const row = bySlot.get(s.id);
                if (!row) continue;
                for (const [band, n] of row.classBands) {
                    classBands.set(band, (classBands.get(band) ?? 0) + n);
                }
                for (const school of row.schools) schools.add(school);
            }

            return {
                scheduleDateId: d.id,
                date: d.date,
                weekday: weekdayName(istWeekday(d.date)),
                priority: d.priority,
                isActive: d.isActive,
                note: d.note,
                sittingsConfigured: d.isActive ? all.length : 0,
                sittingsOpen: all.filter((s) => s.isOpen).length,
                sittingsFull: all.filter((s) => s.isOpen && s.booked >= s.capacity).length,
                capacity,
                students: booked,
                seatsLeft: Math.max(0, capacity - booked),
                schools: schools.size,
                byClassBand: [...classBands.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([classBand, students]) => ({ classBand, students })),
                sittings: all,
            };
        });

        // Participants of an eligible class with no sitting for this instance —
        // the number the "assign everyone" button is there to drive to zero.
        const unassigned = await this.prisma.user.count({
            where: {
                role: Role.STUDENT,
                classBand: { in: instance.exam.classBands },
                bookings: {
                    none: { status: ACTIVE_BOOKING, slot: { examInstanceId } },
                },
            },
        });

        const active = days.filter((d) => d.isActive);
        const totals = {
            days: active.length,
            blackoutDays: days.length - active.length,
            sittingsConfigured: active.reduce((n, d) => n + d.sittingsConfigured, 0),
            sittingsOpen: active.reduce((n, d) => n + d.sittingsOpen, 0),
            sittingsFull: active.reduce((n, d) => n + d.sittingsFull, 0),
            capacity: active.reduce((n, d) => n + d.capacity, 0),
            students: active.reduce((n, d) => n + d.students, 0),
            seatsLeft: active.reduce((n, d) => n + d.seatsLeft, 0),
            unassignedStudents: unassigned,
        };

        const byPriority = [...new Set(days.map((d) => d.priority))]
            .sort((a, b) => a - b)
            .map((priority) => {
                const tier = active.filter((d) => d.priority === priority);
                return {
                    priority,
                    days: tier.length,
                    sittingsConfigured: tier.reduce((n, d) => n + d.sittingsConfigured, 0),
                    capacity: tier.reduce((n, d) => n + d.capacity, 0),
                    students: tier.reduce((n, d) => n + d.students, 0),
                    seatsLeft: tier.reduce((n, d) => n + d.seatsLeft, 0),
                };
            });

        return {
            examInstanceId,
            exam: instance.exam,
            examWindow: { startsAt: instance.startsAt, endsAt: instance.endsAt },
            usesPublishedCalendar: scheduleDates.length > 0,
            totals,
            byPriority,
            days,
        };
    }
}
