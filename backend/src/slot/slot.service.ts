import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { AccessPassStatus, BookingStatus } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { WhatsAppService } from '../notification/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { isDemoExam } from '../common/demo-exams';
import { validateSlotWindow } from '../exam/exam-lifecycle';
import { BookSlotDto, CreateSlotDto } from './dto/slot.dto';

@Injectable()
export class SlotService {
    private readonly logger = new Logger(SlotService.name);

    constructor(
        private prisma: PrismaService,
        private notifications: NotificationService,
        private whatsapp: WhatsAppService,
    ) {}

    async createSlot(dto: CreateSlotDto) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: dto.examInstanceId },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const check = validateSlotWindow(
            { startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) },
            instance,
        );
        if (!check.ok) throw new BadRequestException(check.reason);

        return this.prisma.examSlot.create({
            data: {
                examInstanceId: dto.examInstanceId,
                startsAt: new Date(dto.startsAt),
                endsAt: new Date(dto.endsAt),
                capacity: dto.capacity,
                label: dto.label,
            },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async listSlotsForInstance(examInstanceId: string) {
        return this.prisma.examSlot.findMany({
            where: { examInstanceId },
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async listSlotsForExam(examId: string) {
        return this.prisma.examSlot.findMany({
            where: { examInstance: { examId } },
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async updateSlot(slotId: string, data: Partial<CreateSlotDto>) {
        const slot = await this.prisma.examSlot.findUnique({
            where: { id: slotId },
            include: { examInstance: true },
        });
        if (!slot) throw new NotFoundException('Slot not found');

        const next = {
            startsAt: data.startsAt ? new Date(data.startsAt) : slot.startsAt,
            endsAt: data.endsAt ? new Date(data.endsAt) : slot.endsAt,
        };
        const check = validateSlotWindow(next, slot.examInstance);
        if (!check.ok) throw new BadRequestException(check.reason);

        // Shrinking capacity below what is already booked would leave the slot
        // permanently "oversold" to every capacity guard that reads it.
        if (data.capacity !== undefined && data.capacity < slot.booked) {
            throw new BadRequestException(
                `Capacity cannot be lower than the ${slot.booked} student(s) already booked into this slot.`,
            );
        }

        return this.prisma.examSlot.update({
            where: { id: slotId },
            data: {
                ...(data.startsAt && { startsAt: next.startsAt }),
                ...(data.endsAt && { endsAt: next.endsAt }),
                ...(data.capacity !== undefined && { capacity: data.capacity }),
                ...(data.label !== undefined && { label: data.label }),
            },
            include: { examInstance: { include: { exam: true } } },
        });
    }

    async deleteSlot(slotId: string) {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Slot not found');
        if (slot.booked > 0) throw new BadRequestException('Cannot delete a slot that has bookings');
        await this.prisma.examSlot.delete({ where: { id: slotId } });
        return { success: true };
    }

    async bookSlot(slotId: string, userId: string, _dto: BookSlotDto) {
        const slot = await this.prisma.examSlot.findUnique({
            where: { id: slotId },
            include: { examInstance: { include: { exam: true } } },
        });
        if (!slot) throw new NotFoundException('Schedule not found');

        const now = new Date();
        if (now > slot.endsAt) throw new BadRequestException('Schedule has already ended');

        // Picking a sitting comes *after* paying. A confirmed booking can no
        // longer be changed by the student (see cancelBooking), so letting an
        // unpaid student book would lock them into a slot they cannot yet use
        // and cannot swap once they do pay.
        //
        // Read directly rather than injecting AccessPassService: SlotModule is
        // reachable from PaymentModule via Partner→School, so importing it here
        // would close a module cycle. AccessPassService.hasActivePass is the
        // canonical rule — this must stay in step with it.
        if (!isDemoExam(slot.examInstance.examId)) {
            const pass = await this.prisma.accessPass.findUnique({
                where: { userId },
                select: { status: true },
            });
            if (pass?.status !== AccessPassStatus.ACTIVE) {
                throw new ForbiddenException('ACCESS_PASS_REQUIRED');
            }
        }

        // One active booking per exam per user
        const existingBooking = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstance: { examId: slot.examInstance.examId } },
            },
        });
        if (existingBooking) {
            throw new ConflictException('You already have an active booking for this exam');
        }

        const feeAmount = slot.examInstance.exam.feeAmount ?? 0;

        const result = await this.prisma.$transaction(async (tx) => {
            const fresh = await tx.examSlot.findUnique({ where: { id: slotId } });
            if (!fresh || fresh.booked >= fresh.capacity) {
                throw new ConflictException('Schedule is full');
            }
            await tx.examSlot.update({
                where: { id: slotId },
                data: { booked: { increment: 1 } },
            });

            // Free exam → confirm immediately
            if (feeAmount === 0) {
                const booking = await tx.booking.create({
                    data: { userId, slotId, status: BookingStatus.CONFIRMED },
                    include: { slot: { include: { examInstance: { include: { exam: true } } } } },
                });
                return { booking, requiresPayment: false, amount: 0 };
            }

            // Paid exam → PENDING booking; caller creates Razorpay order next
            const booking = await tx.booking.create({
                data: { userId, slotId, status: BookingStatus.PENDING },
                include: { slot: { include: { examInstance: { include: { exam: true } } } } },
            });
            return { booking, requiresPayment: true, amount: feeAmount };
        });

        // Milestone 2 of 4 — "exam start": a confirmed slot is the moment the exam
        // becomes a real appointment. Sent AFTER the transaction commits, never
        // inside it: a mail provider timeout must not roll back a seat the student
        // has already been told they hold.
        if (result.booking.status === BookingStatus.CONFIRMED) {
            await this.sendSlotConfirmation(userId, result.booking);
        }

        return result;
    }

    /**
     * Best-effort slot confirmation on both channels. Swallows its own failures —
     * the seat is booked either way, and failing the booking over a mail problem
     * would be a strictly worse outcome for the student.
     *
     * The email carries the full detail (admit card, portal link, rules); the
     * WhatsApp `bio_schedule` template carries the date and time and points at
     * that email. They are sent independently on purpose: a student with no
     * phone number on file still gets the mail, and a WATI outage must not cost
     * anyone their confirmation.
     */
    private async sendSlotConfirmation(userId: string, booking: any): Promise<void> {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, firstName: true, rollNumber: true, phone: true, phoneRaw: true },
            });
            if (!user) return;

            if (user.email) {
                await this.notifications.sendSlotConfirmed(user.email, {
                    firstName: user.firstName,
                    examTitle: booking.slot.examInstance.exam.title,
                    slotLabel: booking.slot.label,
                    startsAt: booking.slot.startsAt,
                    endsAt: booking.slot.endsAt,
                    rollNumber: user.rollNumber,
                    bookingId: booking.id,
                });
            }

            await this.whatsapp.sendSchedule({
                userId,
                phone: user.phone,
                phoneRaw: user.phoneRaw,
                firstName: user.firstName,
                bookingId: booking.id,
                slotId: booking.slotId ?? booking.slot.id,
                startsAt: booking.slot.startsAt,
            });
        } catch (err) {
            this.logger.error(
                `Slot confirmation failed for booking ${booking?.id}: ${(err as Error).message}`,
            );
        }
    }

    /**
     * Send the `bio_schedule` WhatsApp for an already-confirmed booking.
     *
     * The single entry point every *other* confirmation path calls — a paid
     * booking confirmed by the Razorpay webhook or the browser callback, a
     * school coordinator's bulk allocation, an admin reassignment. Those paths
     * live in three different services and none of them sent anything, so a
     * student who paid used to hear about their slot only by email.
     *
     * Safe to call from all of them, and safe to call twice: the send is deduped
     * on `(booking, slot)`, which is what lets the webhook and the browser
     * callback both fire for the same payment without messaging anyone twice.
     * Best-effort and never throws — a confirmed seat must not be undone by a
     * messaging failure.
     */
    async notifyScheduleConfirmed(bookingId: string): Promise<void> {
        try {
            const booking = await this.prisma.booking.findUnique({
                where: { id: bookingId },
                select: {
                    id: true,
                    slotId: true,
                    status: true,
                    slot: { select: { startsAt: true } },
                    user: { select: { id: true, firstName: true, phone: true, phoneRaw: true } },
                },
            });
            // Only a confirmed seat is a real appointment; telling a student with
            // a pending (unpaid) booking their exam is scheduled would be wrong.
            if (!booking || booking.status !== BookingStatus.CONFIRMED) return;

            await this.whatsapp.sendSchedule({
                userId: booking.user.id,
                phone: booking.user.phone,
                phoneRaw: booking.user.phoneRaw,
                firstName: booking.user.firstName,
                bookingId: booking.id,
                slotId: booking.slotId,
                startsAt: booking.slot.startsAt,
            });
        } catch (err) {
            this.logger.error(
                `Schedule WhatsApp failed for booking ${bookingId}: ${(err as Error).message}`,
            );
        }
    }

    /**
     * The same message for a whole cohort — an admin moving a school to a new
     * slot, or the auto-distribution that runs when an exam instance is created.
     *
     * **Not awaited by its callers, and sequential inside.** Both properties
     * matter and for opposite reasons: a school of 200 students would otherwise
     * make an admin wait on 200 round-trips to WATI (and time the request out),
     * while firing all 200 at once would trip WATI's rate limit and lose most of
     * them. So the caller returns immediately and this drains in the background,
     * one at a time.
     *
     * Every individual send is already deduped and already swallows its own
     * failures, so nothing here needs a retry — the day-before reminder is the
     * backstop for anyone this misses.
     */
    notifyScheduleConfirmedMany(bookingIds: string[]): void {
        if (!bookingIds.length) return;
        void (async () => {
            for (const id of bookingIds) {
                await this.notifyScheduleConfirmed(id);
            }
            this.logger.log(`Schedule WhatsApp queued for ${bookingIds.length} booking(s).`);
        })();
    }

    async cancelBooking(bookingId: string, userId: string) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { slot: true },
        });
        if (!booking) throw new NotFoundException('Booking not found');
        if (booking.userId !== userId) throw new ForbiddenException();
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Booking already cancelled');
        }
        // Once confirmed, the slot is locked for the student — only an admin
        // (via reassignBooking) can move them. This is what makes the pick a
        // real commitment rather than a placeholder they can swap at will.
        if (booking.status === BookingStatus.CONFIRMED) {
            throw new BadRequestException(
                'Your schedule is confirmed and can no longer be changed. Contact support if you need it moved.',
            );
        }

        await this.prisma.$transaction([
            this.prisma.booking.update({
                where: { id: bookingId },
                data: { status: BookingStatus.CANCELLED },
            }),
            this.prisma.examSlot.update({
                where: { id: booking.slotId },
                data: { booked: { decrement: 1 } },
            }),
        ]);
        return { success: true };
    }

    async getMyBooking(userId: string, examId: string) {
        return this.prisma.booking.findFirst({
            where: {
                userId,
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                slot: { examInstance: { examId } },
            },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });
    }

    /**
     * One booking by id, scoped to its owner.
     *
     * The ownership check is the point: a booking id in a URL must not let one
     * student read another's slot, school and payment. A booking that is not
     * theirs is reported as not found rather than forbidden — "no such booking"
     * and "not yours" should be indistinguishable from outside.
     */
    async getBookingById(bookingId: string, userId: string) {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId, userId },
            include: {
                slot: { include: { examInstance: { include: { exam: true } } } },
                payment: true,
            },
        });
        if (!booking) throw new NotFoundException('Booking not found');
        return booking;
    }

    async adminListSlotBookings(slotId: string) {
        return this.prisma.booking.findMany({
            where: { slotId },
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
                payment: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async adminListAllSlots() {
        return this.prisma.examSlot.findMany({
            orderBy: { startsAt: 'asc' },
            include: { examInstance: { include: { exam: true } } },
        });
    }
}
