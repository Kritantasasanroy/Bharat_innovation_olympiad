import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { SchoolSlotService } from './school-slot.service';

/**
 * `SchoolSlotService` now asks `SlotService` to send the `bio_schedule` WhatsApp
 * after an allocation or a reassignment. It is best-effort and cannot fail the
 * booking, so these tests only need it to exist and stay silent.
 */
const slotServiceStub = (): any => ({
    notifyScheduleConfirmed: jest.fn().mockResolvedValue(undefined),
    notifyScheduleConfirmedMany: jest.fn(),
});


/**
 * The assign / reassign half of the school→slot flow (item 7).
 *
 * The bug these tests exist for: reassigning a school's students to a new slot
 * moved the *bookings* but left the `SchoolSlotAssignment` pointing at the old
 * slot — so the next student from that school to register was auto-allocated
 * straight back into the slot the admin had just emptied, and the school ended up
 * split across two slots. That is exactly what "same school, same slot" exists to
 * prevent, and nothing caught it.
 *
 * The fake below enforces real capacity semantics through the same atomic
 * `updateMany where booked < capacity` guard the service uses, so these prove
 * behaviour rather than that a mock was called.
 */
function createFakeDb() {
    let seq = 0;
    const nextId = (p: string) => `${p}-${++seq}`;

    const future = (h: number) => new Date(Date.now() + h * 3_600_000);

    const exam = { classBands: [8, 9], feeAmount: 0 as number | null };
    const instances: any[] = [
        { id: 'inst-1', exam },
        { id: 'inst-2', exam },
    ];

    const slots: any[] = [];
    const users: any[] = [];
    const bookings: any[] = [];
    const assignments: any[] = [];

    const findSlot = (id: string) => slots.find((s) => s.id === id);

    const prisma: any = {
        $transaction: async (fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)),

        examInstance: {
            findUnique: async ({ where }: any) => instances.find((i) => i.id === where.id) ?? null,
        },

        examSlot: {
            findUnique: async ({ where, include }: any) => {
                const slot = findSlot(where.id);
                if (!slot) return null;
                // The service reads `slot.examInstance.exam.feeAmount` when the
                // relation is included, so the fake has to resolve it too.
                if (include?.examInstance) {
                    const examInstance = instances.find((i) => i.id === slot.examInstanceId);
                    return { ...slot, examInstance };
                }
                return slot;
            },
            findMany: async ({ where }: any) =>
                slots
                    .filter((s) => s.examInstanceId === where.examInstanceId)
                    .sort((a, b) => +a.startsAt - +b.startsAt),
            updateMany: async ({ where, data }: any) => {
                const slot = findSlot(where.id);
                if (!slot) return { count: 0 };
                // The real compare-and-increment guard: refuses to oversell.
                if (where.booked?.lt !== undefined && !(slot.booked < where.booked.lt)) {
                    return { count: 0 };
                }
                if (where.booked?.gt !== undefined && !(slot.booked > where.booked.gt)) {
                    return { count: 0 };
                }
                slot.booked += data.booked.increment ?? 0;
                slot.booked -= data.booked.decrement ?? 0;
                return { count: 1 };
            },
        },

        user: {
            findMany: async ({ where }: any) =>
                users.filter(
                    (u) =>
                        u.schoolId === where.schoolId &&
                        u.role === where.role &&
                        (!where.classBand?.in || where.classBand.in.includes(u.classBand)),
                ),
            findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
            count: async ({ where }: any) =>
                users.filter((u) => u.schoolId === where.schoolId && u.role === where.role).length,
        },

        booking: {
            create: async ({ data }: any) => {
                const row = { id: nextId('bk'), ...data };
                bookings.push(row);
                return row;
            },
            findUnique: async ({ where }: any) => bookings.find((b) => b.id === where.id) ?? null,
            findFirst: async ({ where }: any) =>
                bookings.find((b) => {
                    if (where.userId && b.userId !== where.userId) return false;
                    if (where.status?.in && !where.status.in.includes(b.status)) return false;
                    const slot = findSlot(b.slotId);
                    if (where.slot?.examInstanceId && slot?.examInstanceId !== where.slot.examInstanceId) {
                        return false;
                    }
                    return true;
                }) ?? null,
            findMany: async ({ where }: any) =>
                bookings.filter((b) => {
                    if (where.status?.in && !where.status.in.includes(b.status)) return false;
                    const slot = findSlot(b.slotId);
                    if (where.slot?.examInstanceId && slot?.examInstanceId !== where.slot.examInstanceId) {
                        return false;
                    }
                    if (where.user?.schoolId) {
                        const user = users.find((u) => u.id === b.userId);
                        if (user?.schoolId !== where.user.schoolId) return false;
                    }
                    return true;
                }),
            update: async ({ where, data }: any) => {
                const row = bookings.find((b) => b.id === where.id);
                Object.assign(row, data);
                return row;
            },
        },

        schoolSlotAssignment: {
            findUnique: async ({ where }: any) =>
                assignments.find(
                    (a) =>
                        a.schoolId === where.schoolId_examInstanceId.schoolId &&
                        a.examInstanceId === where.schoolId_examInstanceId.examInstanceId,
                ) ?? null,
            findMany: async ({ where }: any) =>
                assignments.filter((a) => a.schoolId === where.schoolId),
            upsert: async ({ where, update, create }: any) => {
                const found = assignments.find(
                    (a) =>
                        a.schoolId === where.schoolId_examInstanceId.schoolId &&
                        a.examInstanceId === where.schoolId_examInstanceId.examInstanceId,
                );
                if (found) {
                    Object.assign(found, update);
                    return found;
                }
                const row = { id: nextId('asg'), ...create };
                assignments.push(row);
                return row;
            },
        },
    };

    const addSlot = (id: string, capacity: number, examInstanceId = 'inst-1') => {
        slots.push({
            id,
            examInstanceId,
            capacity,
            booked: 0,
            startsAt: future(1),
            endsAt: future(2),
            label: id,
        });
        return id;
    };

    const addStudent = (schoolId: string | null, classBand = 8) => {
        const id = nextId('u');
        users.push({ id, schoolId, role: Role.STUDENT, classBand });
        return id;
    };

    return { prisma, slots, users, bookings, assignments, addSlot, addStudent, findSlot };
}

const setup = () => {
    const db = createFakeDb();
    return { ...db, service: new SchoolSlotService(db.prisma as never, slotServiceStub()) };
};

describe('setSchoolSlotAssignment — assigning a school to a slot', () => {
    it('books every eligible student of the school into the slot', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        t.addStudent('sch-1');
        t.addStudent('sch-1');

        const result = await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');

        expect(result.summary.allocated).toBe(2);
        expect(t.findSlot('slot-a').booked).toBe(2);
    });

    it('explains a zero allocation rather than just reporting "0"', async () => {
        // The screenshot case: a school assigned to a slot, "0 student(s)
        // auto-allocated", and no indication of why. Here the students exist but
        // are in a class the exam does not accept.
        const t = setup();
        t.addSlot('slot-a', 50);
        t.addStudent('sch-1', 5);
        t.addStudent('sch-1', 6);

        const result = await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');

        expect(result.summary.allocated).toBe(0);
        expect(result.summary.totalStudents).toBe(2);
        expect(result.summary.ineligible).toBe(2);
        expect(result.summary.notes.join(' ')).toMatch(/not in a class this exam accepts/i);
    });

    it('says so when the school simply has no students yet', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);

        const result = await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');

        expect(result.summary.allocated).toBe(0);
        expect(result.summary.notes.join(' ')).toMatch(/no students on its roster/i);
    });

    it('never oversells a slot', async () => {
        const t = setup();
        t.addSlot('slot-a', 1);
        t.addStudent('sch-1');
        t.addStudent('sch-1');

        const result = await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');

        expect(t.findSlot('slot-a').booked).toBe(1);
        expect(result.summary.allocated).toBe(1);
        expect(result.summary.noCapacity).toBe(1);
        expect(result.summary.notes.join(' ')).toMatch(/slot is full/i);
    });

    it('refuses a slot belonging to a different exam instance', async () => {
        const t = setup();
        t.addSlot('other', 10, 'inst-2');

        await expect(
            t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'other'),
        ).rejects.toThrow(BadRequestException);
    });
});

describe('reassignSchool — moving a school to another slot (item 7)', () => {
    it('re-points the school assignment, so later registrations follow the students', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        t.addSlot('slot-b', 50);
        t.addStudent('sch-1');

        await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');
        await t.service.reassignSchool('sch-1', 'inst-1', 'slot-b');

        // THE REGRESSION: this used to still read 'slot-a'.
        expect(t.assignments[0].slotId).toBe('slot-b');

        // And the proof of why it matters: a student who registers *after* the
        // move lands with their school, not back in the slot it just left.
        const late = t.addStudent('sch-1');
        await t.service.autoAllocateForNewStudent(late, 'sch-1');

        const theirBooking = t.bookings.find((b) => b.userId === late);
        expect(theirBooking.slotId).toBe('slot-b');
    });

    it('moves the existing bookings and keeps the slot counters consistent', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        t.addSlot('slot-b', 50);
        t.addStudent('sch-1');
        t.addStudent('sch-1');

        await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');
        expect(t.findSlot('slot-a').booked).toBe(2);

        const result = await t.service.reassignSchool('sch-1', 'inst-1', 'slot-b');

        expect(result.total).toBe(2);
        expect(result.succeeded).toHaveLength(2);
        expect(t.findSlot('slot-a').booked).toBe(0);
        expect(t.findSlot('slot-b').booked).toBe(2);
    });

    it('reports a per-student failure without rolling back the students who did move', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        t.addSlot('slot-b', 1); // only room for one of the two
        t.addStudent('sch-1');
        t.addStudent('sch-1');

        await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');
        const result = await t.service.reassignSchool('sch-1', 'inst-1', 'slot-b');

        expect(result.succeeded).toHaveLength(1);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].reason).toMatch(/full/i);
        // The one that fitted really moved; the one that did not stayed put.
        expect(t.findSlot('slot-b').booked).toBe(1);
        expect(t.findSlot('slot-a').booked).toBe(1);
    });

    it('refuses a destination slot from a different exam instance', async () => {
        const t = setup();
        t.addSlot('slot-a', 10);
        t.addSlot('elsewhere', 10, 'inst-2');

        await expect(
            t.service.reassignSchool('sch-1', 'inst-1', 'elsewhere'),
        ).rejects.toThrow(BadRequestException);
    });
});

describe('reassignBooking — moving one student', () => {
    it('refuses when the destination slot is full', async () => {
        const t = setup();
        t.addSlot('slot-a', 10);
        t.addSlot('slot-b', 1);
        const a = t.addStudent('sch-1');
        const b = t.addStudent('sch-2');

        await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');
        await t.service.setSchoolSlotAssignment('sch-2', 'inst-1', 'slot-b'); // fills slot-b

        const aBooking = t.bookings.find((bk) => bk.userId === a);
        await expect(
            t.service.reassignBooking(aBooking.id, 'slot-b'),
        ).rejects.toThrow(ConflictException);

        // The failed move left both counters untouched.
        expect(t.findSlot('slot-a').booked).toBe(1);
        expect(t.findSlot('slot-b').booked).toBe(1);
        expect(b).toBeTruthy();
    });
});

describe('autoAllocateStudent — a student registering into an assigned school', () => {
    it('books them into their school’s slot', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');

        const student = t.addStudent('sch-1');
        const outcome = await t.service.autoAllocateStudent(student, 'inst-1');

        expect(outcome.status).toBe('ALLOCATED');
        expect(t.findSlot('slot-a').booked).toBe(1);
    });

    it('leaves a student who already holds a booking alone', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        const student = t.addStudent('sch-1');
        await t.service.setSchoolSlotAssignment('sch-1', 'inst-1', 'slot-a');

        const again = await t.service.autoAllocateStudent(student, 'inst-1');

        expect(again.status).toBe('MANUALLY_BOOKED');
        // Idempotent: re-running did not double-book them.
        expect(t.findSlot('slot-a').booked).toBe(1);
        expect(t.bookings).toHaveLength(1);
    });

    it('no-ops for a school with no assignment, leaving manual booking flows untouched', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        const student = t.addStudent('sch-9');

        const outcome = await t.service.autoAllocateStudent(student, 'inst-1');

        expect(outcome.status).toBe('NO_ASSIGNMENT');
        expect(t.bookings).toHaveLength(0);
    });

    it('no-ops for an independent student with no school', async () => {
        const t = setup();
        t.addSlot('slot-a', 50);
        const student = t.addStudent(null);

        expect((await t.service.autoAllocateStudent(student, 'inst-1')).status).toBe('NO_SCHOOL');
    });
});
