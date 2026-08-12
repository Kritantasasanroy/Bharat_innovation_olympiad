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
 * Hand-rolled in-memory fake of the slice of PrismaService this module
 * touches. Real capacity/uniqueness semantics are enforced (not just
 * canned return values) so the concurrency test below can actually
 * distinguish a correct atomic implementation from a racy one — a plain
 * jest.fn() stub returning fixed values can't do that.
 *
 * `examSlot.findUnique` + `examSlot.update` are each async with no
 * additional internal awaits, matching how a real Prisma call suspends the
 * caller for exactly one microtask tick. Two concurrent callers awaiting
 * `findUnique` before either has called `update` is exactly the read/write
 * gap that makes the naive find-then-increment pattern unsafe.
 */
function createFakeDb() {
    let seq = 0;
    const nextId = (prefix: string) => `${prefix}-${++seq}`;

    const schools: { id: string }[] = [];
    const exams: { id: string; feeAmount: number | null }[] = [];
    const instances: { id: string; examId: string }[] = [];
    const slots: {
        id: string;
        examInstanceId: string;
        capacity: number;
        booked: number;
        endsAt: Date;
    }[] = [];
    const assignments: {
        id: string;
        schoolId: string;
        examInstanceId: string;
        slotId: string;
        assignedBy?: string;
    }[] = [];
    const bookings: { id: string; userId: string; slotId: string; status: BookingStatus }[] = [];
    const users: { id: string; schoolId: string | null; role: Role }[] = [];

    function examInstanceWithExam(examInstanceId: string) {
        const instance = instances.find((i) => i.id === examInstanceId);
        if (!instance) return undefined;
        const exam = exams.find((e) => e.id === instance.examId)!;
        return { ...instance, exam };
    }

    function bookingMatches(
        b: (typeof bookings)[number],
        where: {
            userId?: string;
            status?: { in: BookingStatus[] };
            slot?: { examInstanceId?: string };
            user?: { schoolId?: string };
        },
    ) {
        if (where.userId && b.userId !== where.userId) return false;
        if (where.status?.in && !where.status.in.includes(b.status)) return false;
        if (where.slot?.examInstanceId) {
            const slot = slots.find((s) => s.id === b.slotId);
            if (!slot || slot.examInstanceId !== where.slot.examInstanceId) return false;
        }
        if (where.user?.schoolId) {
            const user = users.find((u) => u.id === b.userId);
            if (!user || user.schoolId !== where.user.schoolId) return false;
        }
        return true;
    }

    const prisma: any = {
        examSlot: {
            findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
                const slot = slots.find((s) => s.id === id);
                if (!slot) return null;
                return { ...slot, examInstance: examInstanceWithExam(slot.examInstanceId) };
            }),
            update: jest.fn(
                async ({
                    where: { id },
                    data,
                }: {
                    where: { id: string };
                    data: { booked?: { increment?: number; decrement?: number } };
                }) => {
                    const slot = slots.find((s) => s.id === id);
                    if (!slot) throw new Error('slot not found');
                    if (data.booked?.increment) slot.booked += data.booked.increment;
                    if (data.booked?.decrement) slot.booked -= data.booked.decrement;
                    return { ...slot };
                },
            ),
            // Emulates a single `UPDATE ... WHERE ... AND booked < X` statement:
            // the match check and the write happen in the same synchronous tick
            // (no `await` in between), so this is the operation that's actually
            // safe under concurrent callers — unlike a separate
            // findUnique-then-update, which has a read/write gap.
            updateMany: jest.fn(
                async ({
                    where,
                    data,
                }: {
                    where: { id: string; booked?: { lt?: number; gt?: number } };
                    data: { booked?: { increment?: number; decrement?: number } };
                }) => {
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
            ),
        },
        schoolSlotAssignment: {
            findUnique: jest.fn(
                async ({
                    where,
                }: {
                    where: { schoolId_examInstanceId: { schoolId: string; examInstanceId: string } };
                }) => {
                    const key = where.schoolId_examInstanceId;
                    return (
                        assignments.find(
                            (a) => a.schoolId === key.schoolId && a.examInstanceId === key.examInstanceId,
                        ) ?? null
                    );
                },
            ),
            findMany: jest.fn(async ({ where }: { where: { schoolId: string } }) => {
                return assignments.filter((a) => a.schoolId === where.schoolId);
            }),
            upsert: jest.fn(
                async ({
                    where,
                    update,
                    create,
                }: {
                    where: { schoolId_examInstanceId: { schoolId: string; examInstanceId: string } };
                    update: Partial<{ slotId: string; assignedBy?: string }>;
                    create: { schoolId: string; examInstanceId: string; slotId: string; assignedBy?: string };
                }) => {
                    const key = where.schoolId_examInstanceId;
                    const existing = assignments.find(
                        (a) => a.schoolId === key.schoolId && a.examInstanceId === key.examInstanceId,
                    );
                    if (existing) {
                        Object.assign(existing, update);
                        return { ...existing };
                    }
                    const created = { id: nextId('assign'), ...create };
                    assignments.push(created);
                    return { ...created };
                },
            ),
        },
        booking: {
            findFirst: jest.fn(async ({ where }: { where: Parameters<typeof bookingMatches>[1] }) => {
                return bookings.find((b) => bookingMatches(b, where)) ?? null;
            }),
            findMany: jest.fn(async ({ where }: { where: Parameters<typeof bookingMatches>[1] }) => {
                return bookings.filter((b) => bookingMatches(b, where));
            }),
            findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
                return bookings.find((b) => b.id === id) ?? null;
            }),
            create: jest.fn(
                async ({
                    data,
                }: {
                    data: { userId: string; slotId: string; status: BookingStatus };
                }) => {
                    const created = { id: nextId('booking'), ...data };
                    bookings.push(created);
                    return { ...created };
                },
            ),
            update: jest.fn(
                async ({
                    where: { id },
                    data,
                }: {
                    where: { id: string };
                    data: Partial<{ slotId: string; status: BookingStatus }>;
                }) => {
                    const booking = bookings.find((b) => b.id === id);
                    if (!booking) throw new Error('booking not found');
                    Object.assign(booking, data);
                    return { ...booking };
                },
            ),
        },
        user: {
            findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
                return users.find((u) => u.id === id) ?? null;
            }),
            findMany: jest.fn(async ({ where }: { where: { schoolId: string; role?: Role } }) => {
                return users.filter(
                    (u) => u.schoolId === where.schoolId && (!where.role || u.role === where.role),
                );
            }),
        },
        $transaction: jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(prisma)),
    };

    return {
        prisma,
        seed: {
            school: () => {
                const school = { id: nextId('school') };
                schools.push(school);
                return school;
            },
            examInstance: (feeAmount: number | null = 0) => {
                const exam = { id: nextId('exam'), feeAmount };
                exams.push(exam);
                const instance = { id: nextId('instance'), examId: exam.id };
                instances.push(instance);
                return instance;
            },
            slot: (
                examInstanceId: string,
                opts: { capacity?: number; booked?: number; endsAt?: Date } = {},
            ) => {
                const slot = {
                    id: nextId('slot'),
                    examInstanceId,
                    capacity: opts.capacity ?? 10,
                    booked: opts.booked ?? 0,
                    endsAt: opts.endsAt ?? new Date(Date.now() + 86_400_000),
                };
                slots.push(slot);
                return slot;
            },
            assignment: (schoolId: string, examInstanceId: string, slotId: string) => {
                const assignment = { id: nextId('assign'), schoolId, examInstanceId, slotId };
                assignments.push(assignment);
                return assignment;
            },
            student: (schoolId: string) => {
                const user = { id: nextId('user'), schoolId, role: Role.STUDENT };
                users.push(user);
                return user;
            },
            booking: (userId: string, slotId: string, status: BookingStatus) => {
                const booking = { id: nextId('booking'), userId, slotId, status };
                bookings.push(booking);
                return booking;
            },
        },
        slots,
        bookings,
    };
}

describe('SchoolSlotService', () => {
    function setup() {
        const db = createFakeDb();
        const service = new SchoolSlotService(db.prisma as any, slotServiceStub());
        return { db, service };
    }

    it('allocates two students from the same school, same instance, into the same slot', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const slot = db.seed.slot(instance.id, { capacity: 10 });
        db.seed.assignment(school.id, instance.id, slot.id);
        const a = db.seed.student(school.id);
        const b = db.seed.student(school.id);

        const resultA = await service.autoAllocateStudent(a.id, instance.id);
        const resultB = await service.autoAllocateStudent(b.id, instance.id);

        expect(resultA.status).toBe('ALLOCATED');
        expect(resultB.status).toBe('ALLOCATED');
        const slotBookings = db.bookings.filter((bk) => bk.slotId === slot.id);
        expect(slotBookings).toHaveLength(2);
    });

    it('sends students from different schools to their own different slots', async () => {
        const { db, service } = setup();
        const schoolA = db.seed.school();
        const schoolB = db.seed.school();
        const instance = db.seed.examInstance(0);
        const slotA = db.seed.slot(instance.id, { capacity: 10 });
        const slotB = db.seed.slot(instance.id, { capacity: 10 });
        db.seed.assignment(schoolA.id, instance.id, slotA.id);
        db.seed.assignment(schoolB.id, instance.id, slotB.id);
        const studentA = db.seed.student(schoolA.id);
        const studentB = db.seed.student(schoolB.id);

        await service.autoAllocateStudent(studentA.id, instance.id);
        await service.autoAllocateStudent(studentB.id, instance.id);

        expect(db.bookings.find((bk) => bk.userId === studentA.id)?.slotId).toBe(slotA.id);
        expect(db.bookings.find((bk) => bk.userId === studentB.id)?.slotId).toBe(slotB.id);
    });

    it('no-ops when the school has no assignment for the instance (manual booking flow stays available)', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const student = db.seed.student(school.id);
        // No SchoolSlotAssignment seeded at all.

        const result = await service.autoAllocateStudent(student.id, instance.id);

        expect(result.status).toBe('NO_ASSIGNMENT');
        expect(db.bookings).toHaveLength(0);
    });

    it('does not oversell a full slot and reports the failure instead of silently doing nothing', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const slot = db.seed.slot(instance.id, { capacity: 1, booked: 1 }); // already full
        db.seed.assignment(school.id, instance.id, slot.id);
        const student = db.seed.student(school.id);

        const result = await service.autoAllocateStudent(student.id, instance.id);

        expect(result.status).toBe('UNALLOCATED_NO_CAPACITY');
        expect(db.bookings).toHaveLength(0);
        expect(db.slots.find((s) => s.id === slot.id)!.booked).toBe(1);
    });

    it('skips a student who already has a manual booking for the exam (manual booking wins)', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const assignedSlot = db.seed.slot(instance.id, { capacity: 10 });
        const manualSlot = db.seed.slot(instance.id, { capacity: 10 });
        db.seed.assignment(school.id, instance.id, assignedSlot.id);
        const student = db.seed.student(school.id);
        db.seed.booking(student.id, manualSlot.id, BookingStatus.CONFIRMED);

        const result = await service.autoAllocateStudent(student.id, instance.id);

        expect(result.status).toBe('MANUALLY_BOOKED');
        expect(db.bookings).toHaveLength(1);
        expect(db.bookings[0].slotId).toBe(manualSlot.id);
    });

    it('is idempotent — calling it twice for the same student never creates a second booking', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const slot = db.seed.slot(instance.id, { capacity: 10 });
        db.seed.assignment(school.id, instance.id, slot.id);
        const student = db.seed.student(school.id);

        const first = await service.autoAllocateStudent(student.id, instance.id);
        const second = await service.autoAllocateStudent(student.id, instance.id);

        expect(first.status).toBe('ALLOCATED');
        expect(second.status).toBe('MANUALLY_BOOKED'); // the first allocation IS now their booking
        expect(db.bookings).toHaveLength(1);
        expect(db.slots.find((s) => s.id === slot.id)!.booked).toBe(1);
    });

    it('never exceeds slot capacity under concurrent auto-allocation requests', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const slot = db.seed.slot(instance.id, { capacity: 1, booked: 0 });
        db.seed.assignment(school.id, instance.id, slot.id);
        const studentA = db.seed.student(school.id);
        const studentB = db.seed.student(school.id);

        const [resultA, resultB] = await Promise.all([
            service.autoAllocateStudent(studentA.id, instance.id),
            service.autoAllocateStudent(studentB.id, instance.id),
        ]);

        const statuses = [resultA.status, resultB.status].sort();
        expect(statuses).toEqual(['ALLOCATED', 'UNALLOCATED_NO_CAPACITY']);
        expect(db.slots.find((s) => s.id === slot.id)!.booked).toBe(1);
        expect(db.bookings).toHaveLength(1);
    });

    it('reassignBooking moves a student and updates both slots’ booked counts', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const source = db.seed.slot(instance.id, { capacity: 10, booked: 1 });
        const destination = db.seed.slot(instance.id, { capacity: 10, booked: 0 });
        const student = db.seed.student(school.id);
        const booking = db.seed.booking(student.id, source.id, BookingStatus.CONFIRMED);

        const updated = await service.reassignBooking(booking.id, destination.id);

        expect((updated as any).slotId).toBe(destination.id);
        expect(db.slots.find((s) => s.id === source.id)!.booked).toBe(0);
        expect(db.slots.find((s) => s.id === destination.id)!.booked).toBe(1);
    });

    it('reassignSchool reports per-student failures without corrupting counts for students who succeeded', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instance = db.seed.examInstance(0);
        const source = db.seed.slot(instance.id, { capacity: 10, booked: 2 });
        const destination = db.seed.slot(instance.id, { capacity: 1, booked: 0 }); // room for only one
        const studentA = db.seed.student(school.id);
        const studentB = db.seed.student(school.id);
        const bookingA = db.seed.booking(studentA.id, source.id, BookingStatus.CONFIRMED);
        const bookingB = db.seed.booking(studentB.id, source.id, BookingStatus.CONFIRMED);

        const result = await service.reassignSchool(school.id, instance.id, destination.id);

        expect(result.total).toBe(2);
        expect(result.succeeded).toHaveLength(1);
        expect(result.failed).toHaveLength(1);
        // Whichever one succeeded actually moved; the destination never exceeded its capacity of 1.
        expect(db.slots.find((s) => s.id === destination.id)!.booked).toBe(1);
        const movedBookingId = result.succeeded[0];
        expect([bookingA.id, bookingB.id]).toContain(movedBookingId);
    });

    it('rejects assigning a slot that belongs to a different exam instance', async () => {
        const { db, service } = setup();
        const school = db.seed.school();
        const instanceA = db.seed.examInstance(0);
        const instanceB = db.seed.examInstance(0);
        const slotOnInstanceB = db.seed.slot(instanceB.id, { capacity: 10 });

        await expect(
            service.setSchoolSlotAssignment(school.id, instanceA.id, slotOnInstanceB.id),
        ).rejects.toThrow('Slot does not belong to this exam instance');
    });
});
