import { BadRequestException } from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { SchoolSlotService } from './school-slot.service';

/**
 * Focused in-memory fake for `autoDistributeInstance`. Slot capacity is really
 * enforced through the same atomic `updateMany where booked < capacity` guard
 * the service uses, so the tests below can prove the real invariants — balance,
 * whole-school-together, overflow, eligibility, and no over-selling — rather
 * than that a mock was called.
 */
function createFakeDb() {
    let seq = 0;
    const nextId = (p: string) => `${p}-${++seq}`;

    const exam = { classBands: [8], feeAmount: 0 as number | null };
    const instance = { id: 'inst-1', exam };
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    const slots: any[] = [];
    const users: any[] = [];
    const bookings: any[] = [];
    const assignments: any[] = [];

    const prisma: any = {
        examInstance: {
            findUnique: async ({ where }: any) => (where.id === instance.id ? instance : null),
        },
        examSlot: {
            findMany: async ({ where }: any) =>
                slots
                    .filter((s) => s.examInstanceId === where.examInstanceId)
                    .sort((a, b) => a.startsAt - b.startsAt),
            updateMany: async ({ where, data }: any) => {
                const slot = slots.find((s) => s.id === where.id);
                if (!slot) return { count: 0 };
                if (where.booked?.lt !== undefined && !(slot.booked < where.booked.lt)) {
                    return { count: 0 };
                }
                slot.booked += data.booked.increment ?? 0;
                return { count: 1 };
            },
        },
        user: {
            findMany: async ({ where }: any) =>
                users.filter(
                    (u) =>
                        u.role === where.role &&
                        (!where.classBand?.in || where.classBand.in.includes(u.classBand)),
                ),
        },
        booking: {
            findMany: async ({ where }: any) =>
                bookings.filter((b) => {
                    if (where.status?.in && !where.status.in.includes(b.status)) return false;
                    if (where.slot?.examInstanceId) {
                        const slot = slots.find((s) => s.id === b.slotId);
                        if (!slot || slot.examInstanceId !== where.slot.examInstanceId) return false;
                    }
                    return true;
                }),
            create: async ({ data }: any) => {
                const row = { id: nextId('bk'), ...data };
                bookings.push(row);
                return row;
            },
        },
        schoolSlotAssignment: {
            upsert: async ({ where, update, create }: any) => {
                const key = where.schoolId_examInstanceId;
                const found = assignments.find(
                    (a) => a.schoolId === key.schoolId && a.examInstanceId === key.examInstanceId,
                );
                if (found) {
                    Object.assign(found, update);
                    return found;
                }
                const row = { id: nextId('as'), ...create };
                assignments.push(row);
                return row;
            },
        },
        $transaction: async (cb: any) => cb(prisma),
    };

    const addSlot = (id: string, capacity: number, opts: { ended?: boolean } = {}) =>
        slots.push({
            id,
            examInstanceId: 'inst-1',
            capacity,
            booked: 0,
            startsAt: slots.length,
            endsAt: opts.ended ? past : future,
        });

    const addStudents = (schoolId: string | null, count: number, classBand = 8) => {
        for (let i = 0; i < count; i += 1) {
            users.push({ id: nextId('u'), schoolId, role: Role.STUDENT, classBand });
        }
    };

    const bookingsInSlot = (slotId: string) => bookings.filter((b) => b.slotId === slotId);
    const slotOfUser = (userId: string) => bookings.find((b) => b.userId === userId)?.slotId ?? null;
    const schoolOfUser = (userId: string) => users.find((u) => u.id === userId)?.schoolId ?? null;

    return { prisma, exam, slots, users, bookings, assignments, addSlot, addStudents, bookingsInSlot, slotOfUser, schoolOfUser };
}

function setup() {
    const db = createFakeDb();
    return { ...db, service: new SchoolSlotService(db.prisma) };
}

describe('autoDistributeInstance', () => {
    it('keeps each school together and spreads schools across slots (balance)', async () => {
        const db = setup();
        db.addSlot('s1', 100);
        db.addSlot('s2', 100);
        db.addSlot('s3', 100);
        db.addStudents('school-A', 60);
        db.addStudents('school-B', 70);
        db.addStudents('school-C', 50);

        const summary = await db.service.autoDistributeInstance('inst-1');

        // Every student placed, no overflow (each school fits a slot).
        expect(summary.allocated).toBe(180);
        expect(summary.overflowed).toBe(0);
        expect(summary.noCapacity).toBe(0);

        // Each school lands entirely in one slot, and the three schools are in
        // three different slots (balanced, not piled into one).
        const slotOfSchool = (school: string) => {
            const student = db.users.find((u) => u.schoolId === school)!;
            return db.slotOfUser(student.id);
        };
        const slotA = slotOfSchool('school-A');
        const slotB = slotOfSchool('school-B');
        const slotC = slotOfSchool('school-C');
        expect(new Set([slotA, slotB, slotC]).size).toBe(3);

        for (const school of ['school-A', 'school-B', 'school-C']) {
            const slotsUsed = new Set(
                db.users.filter((u) => u.schoolId === school).map((u) => db.slotOfUser(u.id)),
            );
            expect(slotsUsed.size).toBe(1);
        }
    });

    it('overflows a school too big for one slot into the next', async () => {
        const db = setup();
        db.addSlot('s1', 100);
        db.addSlot('s2', 100);
        db.addStudents('big-school', 150);

        const summary = await db.service.autoDistributeInstance('inst-1');

        expect(summary.allocated + summary.overflowed).toBe(150);
        expect(summary.overflowed).toBeGreaterThan(0);
        // Both slots are used, and neither is oversold.
        expect(db.bookingsInSlot('s1').length).toBe(100);
        expect(db.bookingsInSlot('s2').length).toBe(50);
    });

    it('never over-sells: extra students beyond capacity are reported, not booked', async () => {
        const db = setup();
        db.addSlot('s1', 40);
        db.addSlot('s2', 40);
        db.addStudents('school-A', 100); // only 80 seats exist

        const summary = await db.service.autoDistributeInstance('inst-1');

        expect(db.bookings.length).toBe(80);
        expect(summary.noCapacity).toBe(20);
        expect(db.slots.every((s) => s.booked <= s.capacity)).toBe(true);
    });

    it('only places eligible students (class band must match the exam)', async () => {
        const db = setup(); // exam.classBands = [8]
        db.addSlot('s1', 100);
        db.addStudents('school-A', 10, 8); // eligible
        db.addStudents('school-A', 5, 6); // wrong class — not for this exam

        const summary = await db.service.autoDistributeInstance('inst-1');

        expect(summary.allocated).toBe(10);
        expect(db.bookings.length).toBe(10);
    });

    it('leaves already-booked students alone and reports them', async () => {
        const db = setup();
        db.addSlot('s1', 100);
        db.addStudents('school-A', 5);
        // Pre-book one of them.
        const already = db.users[0];
        db.bookings.push({ id: 'pre', userId: already.id, slotId: 's1', status: BookingStatus.CONFIRMED });
        db.slots[0].booked = 1;

        const summary = await db.service.autoDistributeInstance('inst-1');

        expect(summary.skippedAlreadyBooked).toBe(1);
        // 4 remaining placed; the pre-booked one is untouched (still one booking).
        expect(db.bookings.filter((b) => b.userId === already.id).length).toBe(1);
        expect(db.bookings.length).toBe(5);
    });

    it('distributes independent (no-school) students across slots', async () => {
        const db = setup();
        db.addSlot('s1', 2);
        db.addSlot('s2', 2);
        db.addStudents(null, 4);

        const summary = await db.service.autoDistributeInstance('inst-1');

        expect(summary.allocated).toBe(4);
        // Spread, not piled: each capacity-2 slot ends with 2.
        expect(db.bookingsInSlot('s1').length).toBe(2);
        expect(db.bookingsInSlot('s2').length).toBe(2);
    });

    it('ignores slots whose time has already passed', async () => {
        const db = setup();
        db.addSlot('ended', 100, { ended: true });
        db.addSlot('live', 100);
        db.addStudents('school-A', 10);

        await db.service.autoDistributeInstance('inst-1');

        expect(db.bookingsInSlot('ended').length).toBe(0);
        expect(db.bookingsInSlot('live').length).toBe(10);
    });

    it('refuses when the instance has no upcoming slots', async () => {
        const db = setup();
        db.addSlot('ended', 100, { ended: true });
        db.addStudents('school-A', 3);

        await expect(db.service.autoDistributeInstance('inst-1')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
