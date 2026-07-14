import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AllocationStatus =
    | 'ALLOCATED'
    | 'MANUALLY_BOOKED'
    | 'NO_SCHOOL'
    | 'NO_ASSIGNMENT'
    | 'SLOT_ENDED'
    | 'UNALLOCATED_NO_CAPACITY';

export interface AllocationOutcome {
    status: AllocationStatus;
    bookingId?: string;
}

export interface ReassignSchoolResult {
    total: number;
    succeeded: string[];
    failed: { bookingId: string; reason: string }[];
}

/**
 * Auto-allocates students to their school's assigned exam slot, and lets
 * admins edit that assignment or reassign individual students / whole
 * schools afterwards. Schools/instances with no assignment are untouched —
 * the existing manual slot-picker (`SlotService.bookSlot`) keeps working.
 */
@Injectable()
export class SchoolSlotService {
    constructor(private prisma: PrismaService) {}

    /**
     * Assigns (or edits) the slot a school's students use for an exam instance,
     * then sweeps currently-unbooked eligible students into it.
     *
     * Returns a **breakdown**, not just a count. "0 student(s) auto-allocated" is
     * true in half a dozen different situations — the school has no students yet,
     * they are all in the wrong class for this exam, they are already booked, the
     * slot is full — and reporting a bare zero for all of them is what made this
     * screen look broken when it was in fact working. `summary` says which.
     */
    async setSchoolSlotAssignment(
        schoolId: string,
        examInstanceId: string,
        slotId: string,
        assignedBy?: string,
    ) {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Slot not found');
        if (slot.examInstanceId !== examInstanceId) {
            throw new BadRequestException('Slot does not belong to this exam instance');
        }

        const assignment = await this.prisma.schoolSlotAssignment.upsert({
            where: { schoolId_examInstanceId: { schoolId, examInstanceId } },
            update: { slotId, assignedBy },
            create: { schoolId, examInstanceId, slotId, assignedBy },
        });

        const allocation = await this.runAllocationForSchool(schoolId, examInstanceId);
        const summary = await this.summarise(schoolId, examInstanceId, allocation);

        return { assignment, allocation, summary };
    }

    /**
     * Turns the per-student allocation outcomes into something an admin can read,
     * with the context needed to act on it.
     */
    private async summarise(
        schoolId: string,
        examInstanceId: string,
        allocation: Record<string, AllocationOutcome>,
    ) {
        const outcomes = Object.values(allocation);
        const count = (status: AllocationStatus) =>
            outcomes.filter((o) => o.status === status).length;

        const [totalStudents, classBands] = await Promise.all([
            this.prisma.user.count({ where: { schoolId, role: Role.STUDENT } }),
            this.eligibleClassBands(examInstanceId),
        ]);

        const allocated = count('ALLOCATED');
        const alreadyBooked = count('MANUALLY_BOOKED');
        const noCapacity = count('UNALLOCATED_NO_CAPACITY');
        const slotEnded = count('SLOT_ENDED');

        // `allocation` only contains *eligible* students, so anyone missing from it
        // was filtered out by the exam's class bands.
        const ineligible = Math.max(0, totalStudents - outcomes.length);

        const notes: string[] = [];
        if (totalStudents === 0) {
            notes.push('This school has no students on its roster yet.');
        }
        if (ineligible > 0) {
            notes.push(
                `${ineligible} student(s) are not in a class this exam accepts (${(classBands ?? []).join(', ') || 'none'}).`,
            );
        }
        if (alreadyBooked > 0) {
            notes.push(
                `${alreadyBooked} student(s) already hold a booking for this exam and were left where they are. Use "Reassign all" to move them.`,
            );
        }
        if (noCapacity > 0) {
            notes.push(`${noCapacity} student(s) could not fit — the slot is full.`);
        }
        if (slotEnded > 0) {
            notes.push(`${slotEnded} student(s) were skipped because the slot has already ended.`);
        }

        return {
            totalStudents,
            eligibleStudents: outcomes.length,
            allocated,
            alreadyBooked,
            noCapacity,
            slotEnded,
            ineligible,
            notes,
        };
    }

    /** Minimal school directory for the admin assignment UI (the full School module in ROADMAP §Step 2.3 is unbuilt; this is just a read list, not a replacement for it). */
    async listSchools() {
        return this.prisma.school.findMany({
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
    }

    async listAssignmentsForInstance(examInstanceId: string) {
        return this.prisma.schoolSlotAssignment.findMany({
            where: { examInstanceId },
            include: { school: true, slot: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Runs auto-allocation for every currently-unbooked **eligible** STUDENT of a
     * school against one exam instance. "Eligible" means the student's class is
     * one the exam accepts (`Exam.classBands`) — a Class-6 student is not swept
     * into a Class-9-only exam's slot. Idempotent; safe to re-run.
     */
    async runAllocationForSchool(
        schoolId: string,
        examInstanceId: string,
    ): Promise<Record<string, AllocationOutcome>> {
        const classBands = await this.eligibleClassBands(examInstanceId);
        const students = await this.prisma.user.findMany({
            where: {
                schoolId,
                role: Role.STUDENT,
                ...(classBands ? { classBand: { in: classBands } } : {}),
            },
            select: { id: true },
        });

        const results: Record<string, AllocationOutcome> = {};
        for (const student of students) {
            results[student.id] = await this.autoAllocateStudent(student.id, examInstanceId);
        }
        return results;
    }

    /** The class bands an instance's exam accepts, or `null` if the instance is gone. */
    private async eligibleClassBands(examInstanceId: string): Promise<number[] | null> {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            select: { exam: { select: { classBands: true } } },
        });
        return instance?.exam.classBands ?? null;
    }

    /** Runs auto-allocation for one newly-registered student against every exam instance their school already has an assignment for. */
    async autoAllocateForNewStudent(
        userId: string,
        schoolId: string,
    ): Promise<Record<string, AllocationOutcome>> {
        const assignments = await this.prisma.schoolSlotAssignment.findMany({
            where: { schoolId },
            select: { examInstanceId: true },
        });

        const results: Record<string, AllocationOutcome> = {};
        for (const { examInstanceId } of assignments) {
            results[examInstanceId] = await this.autoAllocateStudent(userId, examInstanceId);
        }
        return results;
    }

    /**
     * Books a student into their school's assigned slot for an exam
     * instance. No-ops when there's no school or no assignment, and never
     * overrides a booking the student already holds (manual booking wins).
     */
    async autoAllocateStudent(userId: string, examInstanceId: string): Promise<AllocationOutcome> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { schoolId: true },
        });
        if (!user?.schoolId) return { status: 'NO_SCHOOL' };

        const assignment = await this.prisma.schoolSlotAssignment.findUnique({
            where: { schoolId_examInstanceId: { schoolId: user.schoolId, examInstanceId } },
        });
        if (!assignment) return { status: 'NO_ASSIGNMENT' };

        const existing = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId },
            },
        });
        if (existing) return { status: 'MANUALLY_BOOKED', bookingId: existing.id };

        const slot = await this.prisma.examSlot.findUnique({
            where: { id: assignment.slotId },
            include: { examInstance: { include: { exam: true } } },
        });
        if (!slot) return { status: 'NO_ASSIGNMENT' };

        const now = new Date();
        if (now > slot.endsAt) return { status: 'SLOT_ENDED' };

        const feeAmount = slot.examInstance.exam.feeAmount ?? 0;

        return this.prisma.$transaction(async (tx) => {
            // Atomic compare-and-increment (`UPDATE ... WHERE booked < capacity`)
            // as a single statement — a separate findUnique-then-update has a
            // read/write gap two concurrent requests can both pass through
            // before either commits, overselling the slot.
            const claim = await tx.examSlot.updateMany({
                where: { id: slot.id, booked: { lt: slot.capacity } },
                data: { booked: { increment: 1 } },
            });
            if (claim.count === 0) {
                return { status: 'UNALLOCATED_NO_CAPACITY' as const };
            }
            const booking = await tx.booking.create({
                data: {
                    userId,
                    slotId: slot.id,
                    status: feeAmount === 0 ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
                },
            });
            return { status: 'ALLOCATED' as const, bookingId: booking.id };
        });
    }

    /** Moves one student's booking to a different slot. Capacity-checked on the destination. */
    async reassignBooking(bookingId: string, newSlotId: string) {
        const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) throw new NotFoundException('Booking not found');
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Cannot reassign a cancelled booking');
        }
        if (booking.slotId === newSlotId) return booking;

        const destination = await this.prisma.examSlot.findUnique({ where: { id: newSlotId } });
        if (!destination) throw new NotFoundException('Destination slot not found');

        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.examSlot.updateMany({
                where: { id: newSlotId, booked: { lt: destination.capacity } },
                data: { booked: { increment: 1 } },
            });
            if (claim.count === 0) {
                throw new ConflictException('Destination slot is full');
            }
            await tx.examSlot.updateMany({
                where: { id: booking.slotId, booked: { gt: 0 } },
                data: { booked: { decrement: 1 } },
            });
            return tx.booking.update({ where: { id: bookingId }, data: { slotId: newSlotId } });
        });
    }

    /**
     * Bulk-moves every active booking of a school's students, for one exam
     * instance, to a new slot — and **re-points the school's assignment at that
     * slot**.
     *
     * Re-pointing the assignment is the part that was missing. Moving the
     * bookings alone left `SchoolSlotAssignment` on the old slot, so the next
     * student from that school to register was auto-allocated straight back into
     * the slot the admin had just moved everyone out of, and the school ended up
     * split across two slots — exactly what "same school, same slot" exists to
     * prevent.
     *
     * Reports per-booking success/failure: a capacity shortfall for some students
     * never rolls back the ones that already moved.
     */
    async reassignSchool(
        schoolId: string,
        examInstanceId: string,
        newSlotId: string,
        assignedBy?: string,
    ): Promise<ReassignSchoolResult> {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: newSlotId } });
        if (!slot) throw new NotFoundException('Destination slot not found');
        if (slot.examInstanceId !== examInstanceId) {
            throw new BadRequestException('Slot does not belong to this exam instance');
        }

        const bookings = await this.prisma.booking.findMany({
            where: {
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId },
                user: { schoolId },
            },
        });

        const succeeded: string[] = [];
        const failed: { bookingId: string; reason: string }[] = [];
        for (const booking of bookings) {
            try {
                await this.reassignBooking(booking.id, newSlotId);
                succeeded.push(booking.id);
            } catch (err) {
                failed.push({
                    bookingId: booking.id,
                    reason: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        // Future registrations from this school must follow the students who moved.
        await this.prisma.schoolSlotAssignment.upsert({
            where: { schoolId_examInstanceId: { schoolId, examInstanceId } },
            update: { slotId: newSlotId, assignedBy },
            create: { schoolId, examInstanceId, slotId: newSlotId, assignedBy },
        });

        return { total: bookings.length, succeeded, failed };
    }

    /**
     * Books one student into a specific slot, atomically. Returns false when the
     * slot is full (the same `UPDATE ... WHERE booked < capacity` guard the rest
     * of this service uses, so two concurrent placements can't oversell it).
     */
    private async bookIntoSlot(
        userId: string,
        slotId: string,
        capacity: number,
        confirmed: boolean,
    ): Promise<boolean> {
        return this.prisma.$transaction(async (tx) => {
            const claim = await tx.examSlot.updateMany({
                where: { id: slotId, booked: { lt: capacity } },
                data: { booked: { increment: 1 } },
            });
            if (claim.count === 0) return false;
            await tx.booking.create({
                data: {
                    userId,
                    slotId,
                    status: confirmed ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
                },
            });
            return true;
        });
    }

    /**
     * Auto-assigns every eligible student across an exam instance's slots, in one
     * pass, when the exam is created (or on demand afterwards).
     *
     * The rules the admin asked for:
     *  - **Same school, same slot** — a school's students are kept together, and
     *    the school is pinned to that slot via a `SchoolSlotAssignment` so later
     *    registrations from the same school land there too.
     *  - **Balance, not pile-up** — schools are placed into the emptiest slot that
     *    fits them (largest schools first), so no single slot is crowded while
     *    others sit empty.
     *  - **Overflow** — a school too big for any one slot fills its primary slot,
     *    then spills the remainder into the next-emptiest slots.
     *
     * Eligibility is the exam's `classBands`. A student already booked for this
     * instance (e.g. a manual pick) is left alone. Capacity is never oversold —
     * every booking goes through the atomic guard, and an in-memory capacity
     * mirror only decides *preference*, not permission.
     */
    async autoDistributeInstance(
        examInstanceId: string,
        options: { classBandFilter?: boolean } = {},
    ) {
        const classBandFilter = options.classBandFilter ?? true;

        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { classBands: true, feeAmount: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const now = new Date();
        const confirmed = (instance.exam.feeAmount ?? 0) === 0;

        // Slots that can still take bookings, most-open first is decided per-step.
        const slots = (
            await this.prisma.examSlot.findMany({
                where: { examInstanceId },
                orderBy: { startsAt: 'asc' },
            })
        )
            .filter((s) => s.endsAt > now)
            .map((s) => ({ id: s.id, capacity: s.capacity, remaining: s.capacity - s.booked }));

        if (slots.length === 0) {
            throw new BadRequestException('This exam instance has no upcoming slots to fill.');
        }

        const students = await this.prisma.user.findMany({
            where: {
                role: Role.STUDENT,
                ...(classBandFilter ? { classBand: { in: instance.exam.classBands } } : {}),
            },
            select: { id: true, schoolId: true },
        });

        // Students already booked for this instance keep their slot.
        const existing = await this.prisma.booking.findMany({
            where: {
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstanceId },
            },
            select: { userId: true },
        });
        const alreadyBooked = new Set(existing.map((b) => b.userId));

        const bySchool = new Map<string | null, string[]>();
        for (const s of students) {
            if (alreadyBooked.has(s.id)) continue;
            const key = s.schoolId;
            const list = bySchool.get(key) ?? [];
            list.push(s.id);
            bySchool.set(key, list);
        }

        const summary = { allocated: 0, overflowed: 0, noCapacity: 0, skippedAlreadyBooked: alreadyBooked.size };

        // The emptiest slot first, so a student overflows into the least-crowded one.
        const byRemaining = () => [...slots].sort((a, b) => b.remaining - a.remaining);

        // ── Schools: largest first, kept together where possible ──────────────
        const schoolGroups = [...bySchool.entries()]
            .filter(([schoolId]) => schoolId !== null)
            .sort((a, b) => b[1].length - a[1].length) as [string, string[]][];

        for (const [schoolId, studentIds] of schoolGroups) {
            // Primary slot: the emptiest that fits the whole school, else the emptiest.
            const sorted = byRemaining();
            const fits = sorted.find((s) => s.remaining >= studentIds.length);
            const primary = fits ?? sorted[0];

            await this.prisma.schoolSlotAssignment.upsert({
                where: { schoolId_examInstanceId: { schoolId, examInstanceId } },
                update: { slotId: primary.id },
                create: { schoolId, examInstanceId, slotId: primary.id },
            });

            for (const userId of studentIds) {
                // Prefer the school's primary slot; overflow into the next-emptiest.
                const order = [primary, ...byRemaining().filter((s) => s.id !== primary.id)];
                let placed = false;
                for (const slot of order) {
                    if (slot.remaining <= 0) continue;
                    const ok = await this.bookIntoSlot(userId, slot.id, slot.capacity, confirmed);
                    if (ok) {
                        slot.remaining -= 1;
                        placed = true;
                        if (slot.id === primary.id) summary.allocated += 1;
                        else summary.overflowed += 1;
                        break;
                    }
                }
                if (!placed) summary.noCapacity += 1;
            }
        }

        // ── Independent students (no school): singletons, spread evenly ───────
        for (const userId of bySchool.get(null) ?? []) {
            let placed = false;
            for (const slot of byRemaining()) {
                if (slot.remaining <= 0) continue;
                const ok = await this.bookIntoSlot(userId, slot.id, slot.capacity, confirmed);
                if (ok) {
                    slot.remaining -= 1;
                    placed = true;
                    summary.allocated += 1;
                    break;
                }
            }
            if (!placed) summary.noCapacity += 1;
        }

        return summary;
    }
}
