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

    /** Assigns (or edits) the slot a school's students use for an exam instance, then sweeps currently-unbooked eligible students into it. */
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
        return { assignment, allocation };
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

    /** Runs auto-allocation for every currently-unbooked STUDENT of a school against one exam instance. Idempotent — safe to re-run (e.g. after the assignment changes or as a manual backfill). */
    async runAllocationForSchool(
        schoolId: string,
        examInstanceId: string,
    ): Promise<Record<string, AllocationOutcome>> {
        const students = await this.prisma.user.findMany({
            where: { schoolId, role: Role.STUDENT },
            select: { id: true },
        });

        const results: Record<string, AllocationOutcome> = {};
        for (const student of students) {
            results[student.id] = await this.autoAllocateStudent(student.id, examInstanceId);
        }
        return results;
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

    /** Bulk-moves every active booking of a school's students, for one exam instance, to a new slot. Reports per-booking success/failure — a capacity shortfall for some students never rolls back the ones that already succeeded. */
    async reassignSchool(
        schoolId: string,
        examInstanceId: string,
        newSlotId: string,
    ): Promise<ReassignSchoolResult> {
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
        return { total: bookings.length, succeeded, failed };
    }
}
