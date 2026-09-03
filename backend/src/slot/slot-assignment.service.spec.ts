/**
 * The assigner against a fake database.
 *
 * `slot-assignment.rules.spec.ts` proves the *dates* are right. This proves the
 * part that needs storage to be visible at all: that a full Sunday actually
 * rolls to the next one, that eight weeks of full Sundays fall through to the
 * Saturdays, that a sitting is created on demand rather than pre-seeded, and
 * that fifty seats seat fifty students and not fifty-one.
 */
import { SlotAssignmentService } from './slot-assignment.service';
import { istStartOfDay } from './slot-assignment.rules';
import type { SlotTimingService } from './slot-timing.service';

const ist = (iso: string) => new Date(`${iso}+05:30`);
const day = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

const INSTANCE = {
    id: 'inst-1',
    startsAt: ist('2026-09-01T00:00:00'),
    endsAt: ist('2026-12-31T23:59:00'),
    slotLeadDays: 14,
    slotHorizonDays: 56,
    slotDayPreference: [0, 6],
    exam: { id: 'exam-1', isTrial: false, requiresSlot: true },
};

interface FakeSlot {
    id: string;
    examInstanceId: string;
    timingId: string | null;
    slotDate: Date;
    label: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    booked: number;
}

interface FakeBooking {
    id: string;
    userId: string;
    slotId: string;
    status: string;
    assignedBy: string | null;
}

/**
 * Enough of Prisma to run the assigner: the atomic `updateMany` capacity claim,
 * the booking lookups, and a `$transaction` that just runs the callback (the
 * fake is single-threaded, so the interleaving a real transaction protects
 * against cannot occur here — the oversell test drives the guard directly).
 */
function createFakeDb(opts: { instance?: typeof INSTANCE } = {}) {
    const instance = opts.instance ?? INSTANCE;
    const slots: FakeSlot[] = [];
    const bookings: FakeBooking[] = [];
    const users = new Map<string, { createdAt: Date; activatedAt: Date | null; role: string }>();
    let seq = 0;

    const client = {
        examInstance: {
            findUnique: async ({ where }: any) => (where.id === instance.id ? instance : null),
            findMany: async () => [instance],
        },
        user: {
            findUnique: async ({ where }: any) => users.get(where.id) ?? null,
            findMany: async () => [],
        },
        booking: {
            findFirst: async ({ where, include }: any) => {
                const found = bookings.find(
                    (b) =>
                        b.userId === where.userId &&
                        (where.status?.in ?? [b.status]).includes(b.status) &&
                        slots.find((s) => s.id === b.slotId)?.examInstanceId ===
                            (where.slot?.examInstanceId ?? instance.id),
                );
                if (!found) return null;
                if (!include?.slot) return found;
                const slot = slots.find((s) => s.id === found.slotId)!;
                return { ...found, slot };
            },
            create: async ({ data }: any) => {
                const row = { id: `bk-${++seq}`, assignedBy: null, ...data };
                bookings.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = bookings.find((b) => b.id === where.id)!;
                Object.assign(row, data);
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
            findUnique: async ({ where }: any) => slots.find((s) => s.id === where.id) ?? null,
            findMany: async () => slots,
            create: async ({ data }: any) => {
                const row = { id: `slot-${++seq}`, booked: 0, ...data };
                slots.push(row);
                return row;
            },
            // The real capacity guard: an atomic conditional increment.
            updateMany: async ({ where, data }: any) => {
                const slot = slots.find((s) => s.id === where.id);
                if (!slot) return { count: 0 };
                if (where.booked?.lt !== undefined && !(slot.booked < where.booked.lt)) {
                    return { count: 0 };
                }
                if (where.booked?.gt !== undefined && !(slot.booked > where.booked.gt)) {
                    return { count: 0 };
                }
                if (data.booked?.increment) slot.booked += data.booked.increment;
                if (data.booked?.decrement) slot.booked -= data.booked.decrement;
                return { count: 1 };
            },
        },
        $transaction: async (fn: any) => (typeof fn === 'function' ? fn(client) : Promise.all(fn)),
    };

    return { client, slots, bookings, users, instance };
}

/**
 * A timings catalogue backed by the same slot array, so `ensureSlot` really does
 * create rows the assigner then competes for.
 */
interface FakeTiming {
    id: string;
    weekdays: number[];
    startMinute: number;
    endMinute: number;
    capacity: number;
}

function createFakeTimings(
    db: ReturnType<typeof createFakeDb>,
    timings: FakeTiming[],
): SlotTimingService {
    return {
        timingsForWeekday: async (_instanceId: string, weekday: number) =>
            timings.filter((t) => t.weekdays.includes(weekday)) as never,
        ensureSlot: async (timing: any, slotDate: Date) => {
            const found = db.slots.find(
                (s) => s.timingId === timing.id && s.slotDate.getTime() === slotDate.getTime(),
            );
            if (found) return found as never;
            const row: FakeSlot = {
                id: `slot-${timing.id}-${day(slotDate)}`,
                examInstanceId: db.instance.id,
                timingId: timing.id,
                slotDate,
                label: null,
                startsAt: new Date(slotDate.getTime() + timing.startMinute * 60_000),
                endsAt: new Date(slotDate.getTime() + timing.endMinute * 60_000),
                capacity: timing.capacity,
                booked: 0,
            };
            db.slots.push(row);
            return row as never;
        },
    } as unknown as SlotTimingService;
}

function setup(timingSpec: FakeTiming[]) {
    const db = createFakeDb();
    const service = new SlotAssignmentService(
        db.client as never,
        createFakeTimings(db, timingSpec),
    );
    return { ...db, service };
}

/** A student who registered on Tuesday 1 Sep 2026. */
function register(db: { users: Map<string, any> }, id: string, on = ist('2026-09-01T10:00:00')) {
    db.users.set(id, { createdAt: on, activatedAt: on, role: 'STUDENT' });
    return id;
}

const SUNDAY_10AM: FakeTiming = {
    id: 't-sun', weekdays: [0], startMinute: 600, endMinute: 720, capacity: 50,
};
const SATURDAY_10AM: FakeTiming = {
    id: 't-sat', weekdays: [6], startMinute: 600, endMinute: 720, capacity: 50,
};

// Sittings only exist once someone needs them, so "fill" them by seating
// throwaway students until the capacity guard starts refusing.
async function fill(service: SlotAssignmentService, db: any, count: number) {
    for (let i = 0; i < count; i += 1) {
        register(db, `filler-${i}`);
        await service.ensureAssignment(`filler-${i}`, 'inst-1');
    }
}

describe('SlotAssignmentService.ensureAssignment', () => {
    it('seats a new student on the first Sunday two weeks out', async () => {
        const db = setup([SUNDAY_10AM, SATURDAY_10AM]);
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(day(result.slotStartsAt!)).toBe('2026-09-20');
        expect(db.bookings).toHaveLength(1);
        expect(db.bookings[0].status).toBe('CONFIRMED');
    });

    it('creates the sitting on demand rather than requiring one to exist', async () => {
        const db = setup([SUNDAY_10AM]);
        expect(db.slots).toHaveLength(0);

        register(db, 'stu-1');
        await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(db.slots).toHaveLength(1);
        expect(day(db.slots[0].slotDate)).toBe('2026-09-20');
        expect(db.slots[0].capacity).toBe(50);
    });

    it('rolls to the next Sunday when the first is full', async () => {
        const db = setup([{ ...SUNDAY_10AM, capacity: 2 }]);
        await fill(db.service, db, 2);
        expect(db.slots[0].booked).toBe(2);

        register(db, 'stu-1');
        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(day(result.slotStartsAt!)).toBe('2026-09-27');
    });

    it('never seats more students than a sitting has seats', async () => {
        const db = setup([{ ...SUNDAY_10AM, capacity: 3 }]);
        await fill(db.service, db, 10);

        const first = db.slots.find((s) => day(s.slotDate) === '2026-09-20')!;
        expect(first.booked).toBe(3);
        expect(db.slots.every((s) => s.booked <= s.capacity)).toBe(true);
        // All ten are seated, just spread across consecutive Sundays.
        expect(db.bookings).toHaveLength(10);
    });

    it('falls through to the first Saturday only once every Sunday is full', async () => {
        // Six Sundays fall inside the window for a 1 Sep registration; two seats
        // each means the thirteenth student is the first to see a Saturday.
        const db = setup([
            { ...SUNDAY_10AM, capacity: 2 },
            { ...SATURDAY_10AM, capacity: 2 },
        ]);
        await fill(db.service, db, 12);

        const sundaysUsed = db.slots.filter((s) => s.timingId === 't-sun');
        expect(sundaysUsed).toHaveLength(6);
        expect(sundaysUsed.every((s) => s.booked === 2)).toBe(true);
        // Nobody has touched a Saturday yet.
        expect(db.slots.filter((s) => s.timingId === 't-sat')).toHaveLength(0);

        register(db, 'stu-13');
        const result = await db.service.ensureAssignment('stu-13', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(day(result.slotStartsAt!)).toBe('2026-09-19');
    });

    it('reports ALL_FULL, with an actionable message, once nothing is left', async () => {
        const db = setup([
            { ...SUNDAY_10AM, capacity: 1 },
            { ...SATURDAY_10AM, capacity: 1 },
        ]);
        await fill(db.service, db, 12); // 6 Sundays + 6 Saturdays, one seat each

        register(db, 'stu-13');
        const result = await db.service.ensureAssignment('stu-13', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(result.reason).toBe('ALL_FULL');
        expect(result.message).toContain('Sunday, then Saturday');
    });

    it('says the window is wrong, not that it is full, when sittings fall outside it', async () => {
        // The exam closes at 11:00 on Sunday 20 Sep — the one candidate date that
        // falls inside it — but the only timing runs 10:00–12:00, so the sitting
        // overruns the close by an hour. The date qualifies and the timing
        // exists; it is the sitting itself that cannot be sat. Reporting ALL_FULL
        // here would send an admin off to add seats that would change nothing.
        const tightClose = {
            ...INSTANCE,
            endsAt: ist('2026-09-20T11:00:00'),
        };
        const db = createFakeDb({ instance: tightClose });
        const service = new SlotAssignmentService(
            db.client as never,
            createFakeTimings(db, [SUNDAY_10AM]),
        );
        register(db, 'stu-1');

        const result = await service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(result.reason).toBe('OUTSIDE_EXAM_WINDOW');
        // Nothing unusable was written to the database.
        expect(db.slots).toHaveLength(0);
    });

    it('reports NO_TIMINGS when no timing covers a preferred weekday', async () => {
        // A Wednesday-only timing: the search never reaches it.
        const db = setup([
            { id: 't-wed', weekdays: [3], startMinute: 600, endMinute: 720, capacity: 50 },
        ]);
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(result.reason).toBe('NO_TIMINGS');
        expect(db.bookings).toHaveLength(0);
    });

    it('is idempotent — a second call returns the seat already held', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1');

        const first = await db.service.ensureAssignment('stu-1', 'inst-1');
        const second = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(first.status).toBe('ASSIGNED');
        expect(second.status).toBe('ALREADY_ASSIGNED');
        expect(second.slotId).toBe(first.slotId);
        expect(db.bookings).toHaveLength(1);
        expect(db.slots[0].booked).toBe(1);
    });

    it('counts from each student’s own registration date, not a shared one', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'early', ist('2026-09-01T10:00:00'));
        register(db, 'late', ist('2026-09-21T10:00:00'));

        const early = await db.service.ensureAssignment('early', 'inst-1');
        const late = await db.service.ensureAssignment('late', 'inst-1');

        expect(day(early.slotStartsAt!)).toBe('2026-09-20');
        // 21 Sep + 14 days = 5 Oct, itself a Monday; the first Sunday after is
        // the 11th. Two students in the same cohort, two different dates.
        expect(day(late.slotStartsAt!)).toBe('2026-10-11');
    });

    it('leaves practice and trial exams out of the schedule entirely', async () => {
        const trial = {
            ...INSTANCE,
            exam: { id: 'exam-trial', isTrial: true, requiresSlot: true },
        };
        const db = createFakeDb({ instance: trial });
        const service = new SlotAssignmentService(
            db.client as never,
            createFakeTimings(db, [SUNDAY_10AM]),
        );
        register(db, 'stu-1');

        const result = await service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('NOT_APPLICABLE');
        expect(db.bookings).toHaveLength(0);
        expect(db.slots).toHaveLength(0);
    });

    it('leaves an exam with the slot gate waived out of the schedule too', async () => {
        const waived = {
            ...INSTANCE,
            exam: { id: 'exam-1', isTrial: false, requiresSlot: false },
        };
        const db = createFakeDb({ instance: waived });
        const service = new SlotAssignmentService(
            db.client as never,
            createFakeTimings(db, [SUNDAY_10AM]),
        );
        register(db, 'stu-1');

        expect((await service.ensureAssignment('stu-1', 'inst-1')).status).toBe('NOT_APPLICABLE');
    });

    it('refuses dates outside the exam instance’s own window', async () => {
        // The exam closes 20 days after this student registers, so only the
        // Sunday of 20 Sep is reachable — and the window ends before it.
        const shortWindow = {
            ...INSTANCE,
            startsAt: ist('2026-09-01T00:00:00'),
            endsAt: ist('2026-09-10T23:59:00'),
        };
        const db = createFakeDb({ instance: shortWindow });
        const service = new SlotAssignmentService(
            db.client as never,
            createFakeTimings(db, [SUNDAY_10AM]),
        );
        register(db, 'stu-1');

        const result = await service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(result.reason).toBe('OUTSIDE_EXAM_WINDOW');
    });
});

describe('SlotAssignmentService.reassign', () => {
    it('moves a student between sittings and frees the seat they left', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1');
        await db.service.ensureAssignment('stu-1', 'inst-1');

        const from = db.slots[0];
        // A destination the admin picks by hand.
        db.slots.push({
            id: 'slot-target',
            examInstanceId: 'inst-1',
            timingId: null,
            slotDate: istStartOfDay(ist('2026-10-04T00:00:00')),
            label: 'Make-up',
            startsAt: ist('2026-10-04T10:00:00'),
            endsAt: ist('2026-10-04T12:00:00'),
            capacity: 50,
            booked: 0,
        });

        await db.service.reassign('stu-1', 'slot-target', 'admin-1');

        expect(from.booked).toBe(0);
        expect(db.slots.find((s) => s.id === 'slot-target')!.booked).toBe(1);
        expect(db.bookings[0].slotId).toBe('slot-target');
        expect(db.bookings[0].assignedBy).toBe('admin-1');
    });

    it('refuses to move a student into a full sitting', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1');
        await db.service.ensureAssignment('stu-1', 'inst-1');

        db.slots.push({
            id: 'slot-full',
            examInstanceId: 'inst-1',
            timingId: null,
            slotDate: istStartOfDay(ist('2026-10-04T00:00:00')),
            label: 'Full',
            startsAt: ist('2026-10-04T10:00:00'),
            endsAt: ist('2026-10-04T12:00:00'),
            capacity: 1,
            booked: 1,
        });

        await expect(db.service.reassign('stu-1', 'slot-full', 'admin-1')).rejects.toThrow(
            /full/i,
        );
        // The original seat is untouched by the failed move.
        expect(db.slots[0].booked).toBe(1);
        expect(db.bookings[0].slotId).toBe(db.slots[0].id);
    });
});
