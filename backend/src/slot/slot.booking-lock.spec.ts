import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessPassStatus, BookingStatus } from '@prisma/client';
import { DEMO_EXAM_IDS } from '../common/demo-exams';
import { SlotService } from './slot.service';

/**
 * Booking a free slot now also sends the "your slot is confirmed" milestone
 * email. It is best-effort and deliberately cannot fail a booking, so a stub is
 * all these tests need — `slot.confirmation-email.spec.ts` covers the sending.
 */
const notifications: any = { sendSlotConfirmed: jest.fn().mockResolvedValue(undefined) };

/**
 * A student's chosen sitting is a commitment, not a placeholder.
 *
 * Once a booking is CONFIRMED the student can no longer cancel it — moving them
 * is an admin action (`SchoolSlotService.reassignBooking`). Without this, a
 * student could cancel and re-book at will, which defeats the point of a fixed
 * sitting and lets them shop for a slot after seeing who else is in theirs.
 *
 * A PENDING booking is deliberately still cancellable: payment has not
 * completed, so nothing has been committed yet.
 */
describe('SlotService.cancelBooking — confirmed slots are locked to the student', () => {
    const OWNER = 'student-1';

    function serviceWith(booking: any) {
        const prisma: any = {
            booking: {
                findUnique: jest.fn().mockResolvedValue(booking),
                update: jest.fn().mockResolvedValue({}),
            },
            examSlot: { update: jest.fn().mockResolvedValue({}) },
            $transaction: jest.fn().mockResolvedValue([]),
        };
        return { service: new SlotService(prisma, notifications), prisma };
    }

    const bookingWith = (status: BookingStatus, userId = OWNER) => ({
        id: 'booking-1',
        userId,
        slotId: 'slot-1',
        status,
        slot: { id: 'slot-1' },
    });

    it('refuses to cancel a CONFIRMED booking and writes nothing', async () => {
        const { service, prisma } = serviceWith(bookingWith(BookingStatus.CONFIRMED));

        await expect(service.cancelBooking('booking-1', OWNER)).rejects.toThrow(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('still cancels a PENDING booking, releasing the seat', async () => {
        const { service, prisma } = serviceWith(bookingWith(BookingStatus.PENDING));

        await expect(service.cancelBooking('booking-1', OWNER)).resolves.toEqual({ success: true });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        // The seat must go back to the pool, or the slot leaks capacity.
        expect(prisma.examSlot.update).toHaveBeenCalledWith({
            where: { id: 'slot-1' },
            data: { booked: { decrement: 1 } },
        });
    });

    it('rejects an already-cancelled booking', async () => {
        const { service } = serviceWith(bookingWith(BookingStatus.CANCELLED));
        await expect(service.cancelBooking('booking-1', OWNER)).rejects.toThrow(BadRequestException);
    });

    // Ownership is checked before status, so another student cannot learn that
    // someone else's booking is confirmed by reading the error message.
    it('rejects a booking belonging to someone else', async () => {
        const { service } = serviceWith(bookingWith(BookingStatus.CONFIRMED, 'other-student'));
        await expect(service.cancelBooking('booking-1', OWNER)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an unknown booking id', async () => {
        const { service } = serviceWith(null);
        await expect(service.cancelBooking('nope', OWNER)).rejects.toThrow(NotFoundException);
    });
});

/**
 * Picking a sitting happens *after* paying.
 *
 * This matters more now that a confirmed booking is locked: the olympiad papers
 * carry `feeAmount = 0` (the paywall is the account-level access pass, not a
 * per-slot fee), so without this check an unpaid student's booking would confirm
 * immediately and then be unchangeable — locking them into a slot they cannot
 * use and cannot swap once they do pay.
 */
describe('SlotService.bookSlot — booking requires an active access pass', () => {
    const USER = 'student-1';

    function serviceFor(examId: string, passStatus: AccessPassStatus | null) {
        const prisma: any = {
            examSlot: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'slot-1',
                    capacity: 500,
                    booked: 0,
                    endsAt: new Date(Date.now() + 86_400_000),
                    examInstance: { examId, exam: { feeAmount: 0 } },
                }),
                update: jest.fn().mockResolvedValue({}),
            },
            accessPass: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(passStatus ? { status: passStatus } : null),
            },
            booking: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 'booking-1' }),
            },
            $transaction: jest.fn(async (fn: any) =>
                fn({
                    examSlot: {
                        findUnique: jest
                            .fn()
                            .mockResolvedValue({ id: 'slot-1', capacity: 500, booked: 0 }),
                        update: jest.fn().mockResolvedValue({}),
                    },
                    booking: { create: jest.fn().mockResolvedValue({ id: 'booking-1' }) },
                }),
            ),
        };
        return { service: new SlotService(prisma, notifications), prisma };
    }

    it('refuses to book a real exam without a pass, and takes no seat', async () => {
        const { service, prisma } = serviceFor('exam-9', null);

        await expect(service.bookSlot('slot-1', USER, {} as any)).rejects.toThrow(
            new ForbiddenException('ACCESS_PASS_REQUIRED'),
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a revoked pass — a refund must stop unlocking slots', async () => {
        const { service } = serviceFor('exam-9', AccessPassStatus.REVOKED);
        await expect(service.bookSlot('slot-1', USER, {} as any)).rejects.toThrow(
            new ForbiddenException('ACCESS_PASS_REQUIRED'),
        );
    });

    it('refuses a pass still PENDING payment', async () => {
        const { service } = serviceFor('exam-9', AccessPassStatus.PENDING);
        await expect(service.bookSlot('slot-1', USER, {} as any)).rejects.toThrow(
            new ForbiddenException('ACCESS_PASS_REQUIRED'),
        );
    });

    it('books with an active pass', async () => {
        const { service, prisma } = serviceFor('exam-9', AccessPassStatus.ACTIVE);

        await expect(service.bookSlot('slot-1', USER, {} as any)).resolves.toMatchObject({
            requiresPayment: false,
        });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('exempts the free practice paper, which never needs a pass', async () => {
        const practiceExamId = [...DEMO_EXAM_IDS][0];
        const { service, prisma } = serviceFor(practiceExamId, null);

        await expect(service.bookSlot('slot-1', USER, {} as any)).resolves.toMatchObject({
            requiresPayment: false,
        });
        expect(prisma.accessPass.findUnique).not.toHaveBeenCalled();
    });
});
