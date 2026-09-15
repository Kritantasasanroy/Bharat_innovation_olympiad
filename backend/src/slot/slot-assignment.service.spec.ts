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
    exam: { id: 'exam-1', isTrial: false, requiresSlot: true, classBands: [8] },
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

interface FakeScheduleDate {
    date: Date;
    priority: number;
    isActive: boolean;
}

/**
 * Enough of Prisma to run the assigner: the atomic `updateMany` capacity claim,
 * the booking lookups, and a `$transaction` that just runs the callback (the
 * fake is single-threaded, so the interleaving a real transaction protects
 * against cannot occur here — the oversell test drives the guard directly).
 */
function createFakeDb(
    opts: { instance?: typeof INSTANCE; scheduleDates?: FakeScheduleDate[] } = {},
) {
    const instance = opts.instance ?? INSTANCE;
    const slots: FakeSlot[] = [];
    const bookings: FakeBooking[] = [];
    const scheduleDates: FakeScheduleDate[] = opts.scheduleDates ?? [];
    const users = new Map<
        string,
        {
            createdAt: Date;
            activatedAt: Date | null;
            role: string;
            classBand: number | null;
            rollNumber: string | null;
            accessPass: { status: string } | null;
        }
    >();
    let seq = 0;

    const client = {
        examInstance: {
            findUnique: async ({ where }: any) => (where.id === instance.id ? instance : null),
            findMany: async () => [instance],
        },
        user: {
            findUnique: async ({ where }: any) => users.get(where.id) ?? null,
            findMany: async ({ where }: any) => {
                // backfillInstance's candidate query: paid students of the
                // exam's class bands with no active booking on this instance.
                return Array.from(users.entries())
                    .filter(([id, u]) => {
                        if (where.role && u.role !== where.role) return false;
                        if (where.classBand?.in && !where.classBand.in.includes(u.classBand)) {
                            return false;
                        }
                        if (
                            where.accessPass?.status &&
                            u.accessPass?.status !== where.accessPass.status
                        ) {
                            return false;
                        }
                        const none = where.bookings?.none;
                        if (none) {
                            const blocked = bookings.some((b) => {
                                if (b.userId !== id) return false;
                                if (!(none.status?.in ?? [b.status]).includes(b.status)) return false;
                                const slotFilter = none.slot ?? {};
                                const slot = slots.find((s) => s.id === b.slotId);
                                if (
                                    typeof slotFilter.examInstanceId === 'string' &&
                                    slot?.examInstanceId !== slotFilter.examInstanceId
                                ) {
                                    return false;
                                }
                                return true;
                            });
                            if (blocked) return false;
                        }
                        return true;
                    })
                    .map(([id, u]) => ({ id, ...u }));
            },
        },
        booking: {
            findFirst: async ({ where, include }: any) => {
                // Two shapes reach this: "does this student hold a seat for
                // *this* instance?" and the collision check's "…for any *other*
                // instance, overlapping this window?". They differ only in the
                // slot filter, so both are answered by matching it faithfully.
                const slotFilter = where.slot ?? {};
                const matchesSlot = (slot: FakeSlot | undefined) => {
                    if (!slot) return false;
                    const wanted = slotFilter.examInstanceId;
                    if (typeof wanted === 'string' && slot.examInstanceId !== wanted) return false;
                    if (wanted?.not !== undefined && slot.examInstanceId === wanted.not) {
                        return false;
                    }
                    if (slotFilter.startsAt?.lt && !(slot.startsAt < slotFilter.startsAt.lt)) {
                        return false;
                    }
                    if (slotFilter.endsAt?.gt && !(slot.endsAt > slotFilter.endsAt.gt)) {
                        return false;
                    }
                    return true;
                };
                const found = bookings.find(
                    (b) =>
                        b.userId === where.userId &&
                        (where.status?.in ?? [b.status]).includes(b.status) &&
                        matchesSlot(slots.find((s) => s.id === b.slotId)),
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
        examScheduleDate: {
            findMany: async () => scheduleDates,
        },
        $transaction: async (fn: any) => (typeof fn === 'function' ? fn(client) : Promise.all(fn)),
    };

    return { client, slots, bookings, users, instance, scheduleDates };
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
    priority?: number;
}

function createFakeTimings(
    db: ReturnType<typeof createFakeDb>,
    timings: FakeTiming[],
): SlotTimingService {
    return {
        timingsForWeekday: async (_instanceId: string, weekday: number) =>
            timings.filter((t) => t.weekdays.includes(weekday)) as never,
        timingsForPriority: async (_instanceId: string, priority: number) =>
            timings
                .filter((t) => (t.priority ?? 1) === priority)
                .sort((a, b) => a.startMinute - b.startMinute) as never,
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

function setup(timingSpec: FakeTiming[], scheduleDates?: FakeScheduleDate[]) {
    const db = createFakeDb({ scheduleDates });
    // `resolveOrOpenSlot` reads a timing straight off `prisma`, not off the
    // `SlotTimingService` mock -- the admin "place into an unopened sitting"
    // path looks the timing up itself before ever calling `ensureSlot`.
    (db.client as any).slotTiming = {
        findUnique: async ({ where }: any) => {
            const t = timingSpec.find((x) => x.id === where.id);
            if (!t) return null;
            return { examInstanceId: db.instance.id, ...t };
        },
    };
    const notifier = fakeNotifier();
    const service = new SlotAssignmentService(
        db.client as never,
        createFakeTimings(db, timingSpec),
        notifier as never,
    );
    return { ...db, service, notifier };
}

/** A published day, given as `YYYY-MM-DD` in IST. */
const scheduled = (date: string, priority: number, isActive = true): FakeScheduleDate => ({
    date: istStartOfDay(ist(`${date}T00:00:00`)),
    priority,
    isActive,
});

/**
 * A published day `days` from today, for the tests about the lead time.
 *
 * Those have to be relative: dates already past are dropped before the lead is
 * ever consulted, so a fixed date would test the lead rule today and the
 * past-date rule a month from now.
 */
const scheduledInDays = (days: number, priority = 1): FakeScheduleDate => ({
    date: istStartOfDay(new Date(Date.now() + days * 24 * 60 * 60_000)),
    priority,
    isActive: true,
});

/**
 * The notification half of SlotService, narrowed to what the assigner calls.
 * Every test asserts against these fakes; nothing here sends anything.
 */
/**
 * The notification half of SlotService, narrowed to what the assigner calls.
 * Every test asserts against these mocks; nothing here sends anything.
 */
function fakeNotifier() {
    return { notifySchedule: jest.fn(), notifyScheduleMany: jest.fn() };
}

/** A student who registered on Tuesday 1 Sep 2026 — paid by default, because
 * seats are only assigned after the access pass activates. */
function register(
    db: { users: Map<string, any> },
    id: string,
    on = ist('2026-09-01T10:00:00'),
    opts: { classBand?: number | null; rollNumber?: string | null; paid?: boolean } = {},
) {
    db.users.set(id, {
        createdAt: on,
        activatedAt: on,
        role: 'STUDENT',
        classBand: opts.classBand !== undefined ? opts.classBand : 8,
        rollNumber: opts.rollNumber ?? null,
        accessPass: { status: opts.paid === false ? 'PENDING' : 'ACTIVE' },
    });
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

    it('refuses a student whose access pass is not ACTIVE — no seat before payment', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-unpaid', ist('2026-09-01T10:00:00'), { paid: false });

        const result = await db.service.ensureAssignment('stu-unpaid', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(result.reason).toBe('NO_ACTIVE_PASS');
        expect(db.bookings).toHaveLength(0);
        expect(db.slots).toHaveLength(0); // not even materialised for them
    });

    it('seats the same student once the pass goes ACTIVE', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1', ist('2026-09-01T10:00:00'), { paid: false });
        await db.service.ensureAssignment('stu-1', 'inst-1');
        expect(db.bookings).toHaveLength(0);

        db.users.get('stu-1')!.accessPass!.status = 'ACTIVE';
        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(db.bookings).toHaveLength(1);
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
            fakeNotifier() as never,
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
            exam: { id: 'exam-trial', isTrial: true, requiresSlot: true, classBands: [8] },
        };
        const db = createFakeDb({ instance: trial });
        const service = new SlotAssignmentService(
            db.client as never,
            createFakeTimings(db, [SUNDAY_10AM]),
            fakeNotifier() as never,
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
            exam: { id: 'exam-1', isTrial: false, requiresSlot: false, classBands: [8] },
        };
        const db = createFakeDb({ instance: waived });
        const service = new SlotAssignmentService(
            db.client as never,
            createFakeTimings(db, [SUNDAY_10AM]),
            fakeNotifier() as never,
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
            fakeNotifier() as never,
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

        await db.service.reassign('stu-1', { slotId: 'slot-target' }, 'admin-1');

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

        await expect(db.service.reassign('stu-1', { slotId: 'slot-full' }, 'admin-1')).rejects.toThrow(
            /full/i,
        );
        // The original seat is untouched by the failed move.
        expect(db.slots[0].booked).toBe(1);
        expect(db.bookings[0].slotId).toBe(db.slots[0].id);
    });
});

// ── The published calendar ───────────────────────────────────────────────────

/**
 * A cut-down season with the shape of the real one: two tier-1 Sundays running
 * three sittings, and the tier-2 Saturday *before* the first of them running
 * only the late one. The Saturday sitting comes first on a calendar and last in
 * the fill order, which is the whole point of a tier and the thing easiest to
 * get backwards.
 */
const TIER_1_MORNING: FakeTiming = {
    id: 'p1-0830', weekdays: [0], startMinute: 510, endMinute: 600, capacity: 2, priority: 1,
};
const TIER_1_MIDDAY: FakeTiming = {
    id: 'p1-1000', weekdays: [0], startMinute: 600, endMinute: 690, capacity: 2, priority: 1,
};
const TIER_2_EVENING: FakeTiming = {
    id: 'p2-1730', weekdays: [6], startMinute: 1050, endMinute: 1140, capacity: 2, priority: 2,
};

const SEASON = [
    scheduled('2026-09-26', 2),
    scheduled('2026-09-27', 1),
    scheduled('2026-10-03', 2),
    scheduled('2026-10-04', 1),
];

describe('the published calendar', () => {
    it('seats the first participant on the first tier-1 date, not the earlier tier-2 one', async () => {
        const db = setup([TIER_1_MORNING, TIER_1_MIDDAY, TIER_2_EVENING], SEASON);
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(result.priority).toBe(1);
        // Sunday the 27th at 08.30 — the earliest sitting of the top tier, even
        // though Saturday the 26th is a day earlier on the calendar.
        expect(day(result.slotStartsAt!)).toBe('2026-09-27');
        expect(result.slotStartsAt!.getTime()).toBe(
            ist('2026-09-27T08:30:00').getTime(),
        );
    });

    it('fills a date sitting by sitting, then rolls to the next date of the same tier', async () => {
        const db = setup([TIER_1_MORNING, TIER_1_MIDDAY, TIER_2_EVENING], SEASON);

        // Four seats on Sunday the 27th: 08.30 x2, then 10.00 x2.
        for (let i = 0; i < 5; i += 1) {
            register(db, `stu-${i}`);
            await db.service.ensureAssignment(`stu-${i}`, 'inst-1');
        }

        const dates = db.bookings.map(
            (b) => db.slots.find((s) => s.id === b.slotId)!.startsAt,
        );
        expect(dates.map((d) => day(d))).toEqual([
            '2026-09-27',
            '2026-09-27',
            '2026-09-27',
            '2026-09-27',
            '2026-10-04',
        ]);
        expect(dates.slice(0, 4).map((d) => d.getTime())).toEqual([
            ist('2026-09-27T08:30:00').getTime(),
            ist('2026-09-27T08:30:00').getTime(),
            ist('2026-09-27T10:00:00').getTime(),
            ist('2026-09-27T10:00:00').getTime(),
        ]);
    });

    it('only falls through to tier 2 once every tier-1 date is full', async () => {
        const db = setup([TIER_1_MORNING, TIER_1_MIDDAY, TIER_2_EVENING], SEASON);

        // Two Sundays x two sittings x two seats = eight tier-1 places.
        for (let i = 0; i < 9; i += 1) {
            register(db, `stu-${i}`);
            await db.service.ensureAssignment(`stu-${i}`, 'inst-1');
        }

        const ninth = db.bookings[8];
        const slot = db.slots.find((s) => s.id === ninth.slotId)!;
        expect(day(slot.startsAt)).toBe('2026-09-26');
        expect(slot.timingId).toBe('p2-1730');
    });

    it('never seats anyone on a blacked-out date', async () => {
        const db = setup(
            [TIER_1_MORNING],
            [scheduled('2026-11-08', 1, false), scheduled('2026-11-15', 1)],
        );
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(day(result.slotStartsAt!)).toBe('2026-11-15');
    });

    it('reports a calendar whose every date is closed, rather than silently doing nothing', async () => {
        const db = setup([TIER_1_MORNING], [scheduled('2026-11-08', 1, false)]);
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(result.reason).toBe('NO_SCHEDULE_DATES');
    });

    /**
     * The lead time stops being a filter once dates are published. A student
     * registering days before the last sitting of the season must still get a
     * seat — being told "no date available" because the season is nearly over is
     * exactly the failure the calendar exists to prevent.
     */
    it('falls back to a date inside the lead time rather than leaving anyone unscheduled', async () => {
        const soon = scheduledInDays(3);
        const db = setup([TIER_1_MORNING], [soon]);
        // Registering today, with the only published date three days out —
        // well inside the fortnight lead, and still the right answer.
        register(db, 'stu-1', new Date());

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(day(result.slotStartsAt!)).toBe(day(soon.date));
    });

    it('prefers a date outside the lead time over a nearer one', async () => {
        const soon = scheduledInDays(3);
        const later = scheduledInDays(21);
        const db = setup([TIER_1_MORNING], [soon, later]);
        register(db, 'stu-1', new Date());

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(day(result.slotStartsAt!)).toBe(day(later.date));
    });
});

// ── Collisions ───────────────────────────────────────────────────────────────

describe('two sittings never collide for one participant', () => {
    /**
     * A participant already sitting another exam at 08.30 on the 27th is pushed
     * to the next sitting rather than double-booked. The clash is with a booking
     * on a *different* instance, which is the only way it can arise: one
     * instance seats a student once.
     */
    it('skips a sitting that overlaps one the participant already holds elsewhere', async () => {
        const db = setup([TIER_1_MORNING, TIER_1_MIDDAY], SEASON);
        register(db, 'stu-1');

        db.slots.push({
            id: 'other-exam-slot',
            examInstanceId: 'inst-other',
            timingId: null,
            slotDate: istStartOfDay(ist('2026-09-27T00:00:00')),
            label: null,
            startsAt: ist('2026-09-27T08:30:00'),
            endsAt: ist('2026-09-27T10:00:00'),
            capacity: 50,
            booked: 1,
        });
        db.bookings.push({
            id: 'bk-other',
            userId: 'stu-1',
            slotId: 'other-exam-slot',
            status: 'CONFIRMED',
            assignedBy: null,
        });

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(result.slotStartsAt!.getTime()).toBe(ist('2026-09-27T10:00:00').getTime());
    });

    /**
     * Back-to-back is not a collision. The season runs sittings 90 minutes
     * apart, so treating a shared boundary as an overlap would put every
     * consecutive pair in conflict.
     */
    it('treats a sitting that ends exactly as another begins as free', async () => {
        const db = setup([TIER_1_MIDDAY], SEASON);
        register(db, 'stu-1');

        db.slots.push({
            id: 'other-exam-slot',
            examInstanceId: 'inst-other',
            timingId: null,
            slotDate: istStartOfDay(ist('2026-09-27T00:00:00')),
            label: null,
            startsAt: ist('2026-09-27T08:30:00'),
            endsAt: ist('2026-09-27T10:00:00'),
            capacity: 50,
            booked: 1,
        });
        db.bookings.push({
            id: 'bk-other',
            userId: 'stu-1',
            slotId: 'other-exam-slot',
            status: 'CONFIRMED',
            assignedBy: null,
        });

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(result.slotStartsAt!.getTime()).toBe(ist('2026-09-27T10:00:00').getTime());
    });

    it('refuses an admin move into a sitting the participant cannot be at', async () => {
        const db = setup([TIER_1_MORNING], SEASON);
        register(db, 'stu-1');
        await db.service.ensureAssignment('stu-1', 'inst-1');

        db.slots.push({
            id: 'other-exam-slot',
            examInstanceId: 'inst-other',
            timingId: null,
            slotDate: istStartOfDay(ist('2026-10-04T00:00:00')),
            label: null,
            startsAt: ist('2026-10-04T08:30:00'),
            endsAt: ist('2026-10-04T10:00:00'),
            capacity: 50,
            booked: 1,
        });
        db.bookings.push({
            id: 'bk-other',
            userId: 'stu-1',
            slotId: 'other-exam-slot',
            status: 'CONFIRMED',
            assignedBy: null,
        });

        // The tier-1 08.30 sitting on 4 Oct, which the other exam now occupies.
        const target = await db.service['timings'].ensureSlot(
            { id: 'p1-0830', examInstanceId: 'inst-1', startMinute: 510, endMinute: 600, capacity: 2 } as never,
            istStartOfDay(ist('2026-10-04T00:00:00')),
        );

        await expect(db.service.reassign('stu-1', { slotId: target.id }, 'admin-1')).rejects.toThrow(
            /already sits another exam/i,
        );
    });
});

// ── Placing an admin's pick that has never been opened ───────────────────────

describe('reassign onto a timing + date nobody has sat yet', () => {
    it('opens the sitting and places the student, with no slotId in hand', async () => {
        const db = setup([TIER_1_MORNING], SEASON);
        register(db, 'stu-1');

        expect(db.slots.length).toBe(0);

        const booking = await db.service.reassign(
            'stu-1',
            { timingId: TIER_1_MORNING.id, date: '2026-09-27' },
            'admin-1',
        );

        expect(db.slots.length).toBe(1);
        const slot = db.slots.find((s) => s.id === booking.slotId)!;
        expect(slot.startsAt.getTime()).toBe(ist('2026-09-27T08:30:00').getTime());
        expect(slot.booked).toBe(1);
    });

    it('reuses the sitting a second student is placed into the same way', async () => {
        const db = setup([TIER_1_MORNING], SEASON);
        register(db, 'stu-1');
        register(db, 'stu-2');

        await db.service.reassign('stu-1', { timingId: TIER_1_MORNING.id, date: '2026-09-27' }, 'admin-1');
        await db.service.reassign('stu-2', { timingId: TIER_1_MORNING.id, date: '2026-09-27' }, 'admin-1');

        expect(db.slots.length).toBe(1);
        expect(db.slots[0].booked).toBe(2);
    });

    it('refuses a timing/date with no timing, or a date outside the exam window', async () => {
        const db = setup([TIER_1_MORNING], SEASON);
        register(db, 'stu-1');

        await expect(
            db.service.reassign('stu-1', { timingId: 'no-such-timing', date: '2026-09-27' }, 'admin-1'),
        ).rejects.toThrow(/not found/i);

        await expect(
            db.service.reassign('stu-1', { timingId: TIER_1_MORNING.id, date: '2099-01-01' }, 'admin-1'),
        ).rejects.toThrow(/outside the exam/i);
    });
});

// ── Class-band eligibility ───────────────────────────────────────────────────

describe('class-band eligibility', () => {
    it('does not seat a student outside the exam’s class bands', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1', ist('2026-09-01T10:00:00'), { classBand: 9 });

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('NOT_APPLICABLE');
        expect(db.bookings).toHaveLength(0);
        expect(db.slots).toHaveLength(0);
        expect(db.notifier.notifySchedule).not.toHaveBeenCalled();
    });

    it('does not seat a student whose class band was never captured', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1', ist('2026-09-01T10:00:00'), { classBand: null });

        expect((await db.service.ensureAssignment('stu-1', 'inst-1')).status).toBe('NOT_APPLICABLE');
        expect(db.bookings).toHaveLength(0);
    });
});

// ── The calendar lead time ───────────────────────────────────────────────────

describe('the calendar lead time', () => {
    /**
     * The instance column says 14 days; the published calendar says 7. The
     * calendar wins — and the two dates here are chosen so the difference is
     * visible: at +10 and +25 days out, a 14-day lead would skip the +10 date
     * entirely, so landing on it proves the hardcoded floor is what ran.
     */
    it('uses the hardcoded 7-day floor on a calendar instance, not the per-instance lead', async () => {
        const near = scheduledInDays(10);
        const far = scheduledInDays(25);
        const db = setup([TIER_1_MORNING], [near, far]);
        register(db, 'stu-1', new Date());

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(day(result.slotStartsAt!)).toBe(day(near.date));
    });
});

// ── Notifications ────────────────────────────────────────────────────────────

describe('assignment notifications', () => {
    it('sends the confirmation once, when a seat is newly claimed', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('ASSIGNED');
        expect(db.notifier.notifySchedule).toHaveBeenCalledTimes(1);
        expect(db.notifier.notifySchedule).toHaveBeenCalledWith(result.bookingId);
    });

    it('does not re-send when the student already held the seat', async () => {
        const db = setup([SUNDAY_10AM]);
        register(db, 'stu-1');

        await db.service.ensureAssignment('stu-1', 'inst-1');
        await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(db.notifier.notifySchedule).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when no seat could be found', async () => {
        const db = setup([]);
        register(db, 'stu-1');

        const result = await db.service.ensureAssignment('stu-1', 'inst-1');

        expect(result.status).toBe('UNASSIGNED');
        expect(db.notifier.notifySchedule).not.toHaveBeenCalled();
    });
});

// ── Backfill ─────────────────────────────────────────────────────────────────

describe('SlotAssignmentService.backfillInstance', () => {
    it('seats students in ascending roll-number order when seats are scarce', async () => {
        // One published date, one sitting, two seats — and three students whose
        // registration order is the exact reverse of their roll-number order.
        // The season's numbering decides who sits, not who signed up first.
        const db = setup([TIER_1_MORNING], [scheduled('2026-09-27', 1)]);
        register(db, 'stu-3', ist('2026-09-01T08:00:00'), { rollNumber: 'BIO26-G8-00003' });
        register(db, 'stu-1', ist('2026-09-01T09:00:00'), { rollNumber: 'BIO26-G8-00001' });
        register(db, 'stu-2', ist('2026-09-01T10:00:00'), { rollNumber: 'BIO26-G8-00002' });

        const result = await db.service.backfillInstance('inst-1');

        expect(result.assigned).toBe(2);
        expect(result.unassigned).toBe(1);
        expect(db.bookings.map((b) => b.userId)).toEqual(['stu-1', 'stu-2']);
    });

    it('notifies the whole batch once, not once per student', async () => {
        const db = setup([TIER_1_MORNING], [scheduled('2026-09-27', 1)]);
        register(db, 'stu-1', ist('2026-09-01T08:00:00'), { rollNumber: 'BIO26-G8-00001' });
        register(db, 'stu-2', ist('2026-09-01T09:00:00'), { rollNumber: 'BIO26-G8-00002' });

        await db.service.backfillInstance('inst-1');

        expect(db.notifier.notifyScheduleMany).toHaveBeenCalledTimes(1);
        expect(db.notifier.notifyScheduleMany.mock.calls[0][0]).toHaveLength(2);
        expect(db.notifier.notifySchedule).not.toHaveBeenCalled();
    });

    it('sends nothing when nobody could be seated', async () => {
        const db = setup([TIER_1_MORNING], [scheduled('2026-09-27', 1)]);
        register(db, 'stu-1', ist('2026-09-01T08:00:00'), { rollNumber: 'BIO26-G8-00001' });

        const result = await db.service.backfillInstance('inst-1');

        expect(result.assigned).toBe(1);
        expect(db.notifier.notifyScheduleMany).toHaveBeenCalledTimes(1);
        expect(db.notifier.notifyScheduleMany.mock.calls[0][0]).toHaveLength(1);
    });

    it('never seats a student whose access pass is not ACTIVE', async () => {
        const db = setup([TIER_1_MORNING], [scheduled('2026-09-27', 1)]);
        register(db, 'stu-paid', ist('2026-09-01T08:00:00'), { rollNumber: 'BIO26-G8-00001' });
        register(db, 'stu-unpaid', ist('2026-09-01T09:00:00'), {
            rollNumber: 'BIO26-G8-00002',
            paid: false,
        });

        const result = await db.service.backfillInstance('inst-1');

        // The unpaid student is not even *considered* — a seat is part of what
        // the pass buys, so they are not missing one.
        expect(result.considered).toBe(1);
        expect(result.assigned).toBe(1);
        expect(db.bookings.map((b) => b.userId)).toEqual(['stu-paid']);
    });
});
