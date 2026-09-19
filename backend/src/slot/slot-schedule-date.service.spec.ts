/**
 * `createWithTimings` — the date-first creation call the admin wizard uses:
 * one date, its priority, and the sittings (time + seats) directly under it.
 *
 * What's pinned here is the one subtlety in that shape: a `SlotTiming` is
 * still the underlying catalogue row, shared by every date at the same
 * priority and start time, but each date's own seat count must win over
 * whatever that shared timing's default capacity is.
 */
import { SlotScheduleDateService } from './slot-schedule-date.service';
import { SlotService } from './slot.service';
import { SlotTimingService } from './slot-timing.service';

interface FakeInstance {
    id: string;
    startsAt: Date;
    endsAt: Date;
}

interface FakeDateRow {
    id: string;
    examInstanceId: string;
    date: Date;
    priority: number;
    isActive: boolean;
    note: string | null;
}

interface FakeTimingRow {
    id: string;
    examInstanceId: string;
    label: string | null;
    startMinute: number;
    endMinute: number;
    capacity: number;
    weekdays: number[];
    priority: number;
    isActive: boolean;
    sortOrder: number;
}

interface FakeSlotRow {
    id: string;
    examInstanceId: string;
    timingId: string;
    slotDate: Date;
    label: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    booked: number;
}

function setup() {
    const instance: FakeInstance = {
        id: 'inst-1',
        startsAt: new Date('2026-01-01'),
        endsAt: new Date('2027-01-01'),
    };
    const dates: FakeDateRow[] = [];
    const timings: FakeTimingRow[] = [];
    const slots: FakeSlotRow[] = [];

    const prisma = {
        examInstance: {
            findUnique: async ({ where }: any) => (where.id === instance.id ? instance : null),
        },
        examScheduleDate: {
            findFirst: async ({ where }: any) =>
                dates.find(
                    (d) =>
                        d.examInstanceId === where.examInstanceId &&
                        d.date.getTime() === where.date.getTime(),
                ) ?? null,
            findMany: async ({ where }: any) =>
                dates.filter(
                    (d) =>
                        d.examInstanceId === where.examInstanceId &&
                        (where.isActive === undefined || d.isActive === where.isActive),
                ),
            create: async ({ data }: any) => {
                const row: FakeDateRow = { id: `date-${dates.length + 1}`, ...data };
                dates.push(row);
                return row;
            },
        },
        slotTiming: {
            findFirst: async ({ where }: any) =>
                timings.find(
                    (t) =>
                        t.examInstanceId === where.examInstanceId &&
                        t.priority === where.priority &&
                        t.startMinute === where.startMinute,
                ) ?? null,
            findMany: async ({ where }: any) =>
                timings.filter(
                    (t) =>
                        t.examInstanceId === where.examInstanceId &&
                        (where.priority === undefined || t.priority === where.priority) &&
                        (where.isActive === undefined || t.isActive === where.isActive),
                ),
            create: async ({ data }: any) => {
                const row: FakeTimingRow = { id: `timing-${timings.length + 1}`, ...data };
                timings.push(row);
                return row;
            },
        },
        examSlot: {
            findFirst: async ({ where }: any) =>
                slots.find(
                    (s) =>
                        s.timingId === where.timingId &&
                        s.slotDate.getTime() === where.slotDate.getTime(),
                ) ?? null,
            findUnique: async ({ where }: any) => {
                const slot = slots.find((s) => s.id === where.id);
                return slot ? { ...slot, examInstance: instance } : null;
            },
            create: async ({ data }: any) => {
                const row: FakeSlotRow = { id: `slot-${slots.length + 1}`, booked: 0, ...data };
                slots.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = slots.find((s) => s.id === where.id)!;
                Object.assign(row, data);
                return row;
            },
        },
    };

    const slotTimings = new SlotTimingService(prisma as never);
    const slotService = new SlotService(
        prisma as never,
        { announce: async () => undefined } as never,
        {} as never,
        {} as never,
    );
    const service = new SlotScheduleDateService(prisma as never, slotTimings, slotService);
    return { service, dates, timings, slots };
}

describe('SlotScheduleDateService.createWithTimings', () => {
    it('creates the date, its timing, and an open sitting at the requested seats', async () => {
        const db = setup();

        const result = await db.service.createWithTimings({
            examInstanceId: 'inst-1',
            date: '2026-09-22',
            priority: 1,
            timings: [{ startTime: '11:00', endTime: '12:00', seats: 30 }],
        } as never);

        expect(db.dates).toHaveLength(1);
        expect(db.timings).toHaveLength(1);
        expect(result.sittings).toHaveLength(1);
        expect(result.sittings[0].capacity).toBe(30);
    });

    it('reuses the same timing for a second date at the same priority and time', async () => {
        const db = setup();

        await db.service.createWithTimings({
            examInstanceId: 'inst-1',
            date: '2026-09-22',
            priority: 1,
            timings: [{ startTime: '11:00', endTime: '12:00', seats: 30 }],
        } as never);
        await db.service.createWithTimings({
            examInstanceId: 'inst-1',
            date: '2026-09-29',
            priority: 1,
            timings: [{ startTime: '11:00', endTime: '12:00', seats: 30 }],
        } as never);

        // One shared SlotTiming, but two real dated sittings underneath it.
        expect(db.timings).toHaveLength(1);
        expect(db.slots).toHaveLength(2);
    });

    it("a date's own seat count overrides the shared timing's default capacity", async () => {
        const db = setup();

        // First date sets the timing's default to 30.
        await db.service.createWithTimings({
            examInstanceId: 'inst-1',
            date: '2026-09-22',
            priority: 1,
            timings: [{ startTime: '11:00', endTime: '12:00', seats: 30 }],
        } as never);

        // Second date, same slot, wants only 10 seats -- the shared timing
        // stays at capacity 30 (nothing re-sizes existing sittings), but this
        // date's own sitting must reflect 10, not the timing's default.
        const second = await db.service.createWithTimings({
            examInstanceId: 'inst-1',
            date: '2026-09-29',
            priority: 1,
            timings: [{ startTime: '11:00', endTime: '12:00', seats: 10 }],
        } as never);

        expect(db.timings).toHaveLength(1);
        expect(db.timings[0].capacity).toBe(30);
        expect(second.sittings[0].capacity).toBe(10);

        const firstDateSlot = db.slots.find((s) => s.slotDate.getTime() === db.dates[0].date.getTime());
        expect(firstDateSlot!.capacity).toBe(30);
    });
});
