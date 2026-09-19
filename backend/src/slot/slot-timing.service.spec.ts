/**
 * The timings catalogue, against a fake database.
 *
 * The overlap guard that used to live in `create`/`update` is gone — two
 * overlapping same-tier sittings are now a legitimate configuration, not an
 * error — so what is pinned here is what replaced it and what was always
 * independent of it: same-tier overlap is accepted, cross-tier overlap always
 * was, and a zero-length sitting is still refused by the window parser.
 */
import { BadRequestException } from '@nestjs/common';
import { SlotTimingService } from './slot-timing.service';

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

interface FakeScheduleDateRow {
    date: Date;
    priority: number;
    isActive: boolean;
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
}

/**
 * `inst-1` runs from 2026-01-01 to 2027-01-01 by default -- wide enough that
 * `materializeCalendar`'s window check never trips in tests that don't care
 * about it.
 */
function createFakePrisma(
    existing: FakeTimingRow[] = [],
    scheduleDates: FakeScheduleDateRow[] = [],
) {
    const timings = [...existing];
    const dates = [...scheduleDates];
    const slots: FakeSlotRow[] = [];
    const client = {
        examInstance: {
            findUnique: async ({ where }: any) =>
                where.id === 'inst-1'
                    ? { id: 'inst-1', startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01') }
                    : null,
        },
        examScheduleDate: {
            findMany: async ({ where }: any) =>
                dates.filter((d) => (where?.isActive === undefined ? true : d.isActive === where.isActive)),
        },
        slotTiming: {
            findUnique: async ({ where }: any) =>
                timings.find((t) => t.id === where.id) ?? null,
            findMany: async ({ where }: any) =>
                timings.filter(
                    (t) =>
                        (where?.priority === undefined || t.priority === where.priority) &&
                        (where?.isActive === undefined || t.isActive === where.isActive),
                ),
            create: async ({ data }: any) => {
                const row: FakeTimingRow = { id: `t-${timings.length + 1}`, ...data };
                timings.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = timings.find((t) => t.id === where.id)!;
                Object.assign(row, data);
                return row;
            },
        },
        examSlot: {
            count: async () => 0,
            aggregate: async () => ({ _sum: { booked: 0 } }),
            deleteMany: async () => ({ count: 0 }),
            findFirst: async ({ where }: any) =>
                slots.find(
                    (s) =>
                        s.timingId === where.timingId &&
                        s.slotDate.getTime() === where.slotDate.getTime(),
                ) ?? null,
            create: async ({ data }: any) => {
                const row: FakeSlotRow = { id: `slot-${slots.length + 1}`, ...data };
                slots.push(row);
                return row;
            },
        },
    };
    return { client, timings, dates, slots };
}

const EXISTING_MORNING: FakeTimingRow = {
    id: 't-existing',
    examInstanceId: 'inst-1',
    label: 'Morning',
    startMinute: 600, // 10:00
    endMinute: 720, // 12:00
    capacity: 50,
    weekdays: [0],
    priority: 1,
    isActive: true,
    sortOrder: 0,
};

function setup(existing: FakeTimingRow[] = [], scheduleDates: FakeScheduleDateRow[] = []) {
    const db = createFakePrisma(existing, scheduleDates);
    return { ...db, service: new SlotTimingService(db.client as never) };
}

describe('SlotTimingService.create', () => {
    it('allows two overlapping sittings of the same tier', async () => {
        const db = setup([EXISTING_MORNING]);

        // 10:00–12:30 runs straight into the existing 10:00–12:00 sitting on
        // the same tier. One slot can start while another is still running —
        // that is the admin's call now, not the catalogue's.
        const created = await db.service.create({
            examInstanceId: 'inst-1',
            startTime: '10:00',
            endTime: '12:30',
            priority: 1,
        } as never);

        expect(created.startMinute).toBe(600);
        expect(created.endMinute).toBe(750);
        expect(db.timings).toHaveLength(2);
    });

    it('still accepts an overlapping sitting of a different tier', async () => {
        const db = setup([EXISTING_MORNING]);

        const created = await db.service.create({
            examInstanceId: 'inst-1',
            startTime: '10:00',
            endTime: '12:30',
            priority: 2,
        } as never);

        expect(created.priority).toBe(2);
        expect(db.timings).toHaveLength(2);
    });

    it('still refuses a zero-length sitting', async () => {
        const db = setup();

        await expect(
            db.service.create({
                examInstanceId: 'inst-1',
                startTime: '10:00',
                endTime: '10:00',
            } as never),
        ).rejects.toThrow(BadRequestException);
    });

    it('still rejects times that are not HH:mm', async () => {
        const db = setup();

        await expect(
            db.service.create({ examInstanceId: 'inst-1', startTime: '10am', endTime: '12:00' } as never),
        ).rejects.toThrow(BadRequestException);
    });
});

describe('SlotTimingService.update', () => {
    it('accepts an overlapping rewrite of an existing timing', async () => {
        const db = setup([EXISTING_MORNING]);

        const updated = await db.service.update('t-existing', {
            endTime: '13:00',
        } as never);

        expect(updated.endMinute).toBe(780);
    });
});

describe('SlotTimingService materialisation', () => {
    const SUNDAY = { date: new Date('2026-09-27'), priority: 1, isActive: true };

    it('opens a sitting for every active date x matching-priority timing', async () => {
        const db = setup([EXISTING_MORNING], [SUNDAY]);

        const result = await db.service.materializeCalendar('inst-1');

        expect(result.opened).toBe(1);
        expect(result.alreadyOpen).toBe(0);
        expect(db.slots).toHaveLength(1);
        expect(db.slots[0]).toMatchObject({ timingId: 't-existing' });
    });

    it('is idempotent: re-running finds the pairing already open', async () => {
        const db = setup([EXISTING_MORNING], [SUNDAY]);

        await db.service.materializeCalendar('inst-1');
        const second = await db.service.materializeCalendar('inst-1');

        expect(second.opened).toBe(0);
        expect(second.alreadyOpen).toBe(1);
        expect(db.slots).toHaveLength(1);
    });

    it('skips an inactive (blacked-out) date', async () => {
        const db = setup([EXISTING_MORNING], [{ ...SUNDAY, isActive: false }]);

        const result = await db.service.materializeCalendar('inst-1');

        expect(result.datesChecked).toBe(0);
        expect(db.slots).toHaveLength(0);
    });

    it('creating a timing opens sittings for dates already on the calendar', async () => {
        const db = setup([], [SUNDAY]);

        await db.service.create({
            examInstanceId: 'inst-1',
            startTime: '10:00',
            endTime: '11:30',
            priority: 1,
        } as never);

        expect(db.slots).toHaveLength(1);
    });
});
