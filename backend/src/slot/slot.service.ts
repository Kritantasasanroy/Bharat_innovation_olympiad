import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { WhatsAppService } from '../notification/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateSlotWindow } from '../exam/exam-lifecycle';
import { CreateSlotDto, UpdateSlotDto } from './dto/slot.dto';
import { istStartOfDay, istWeekday, weekdayName } from './slot-assignment.rules';

const ACTIVE_BOOKING = { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] };

/**
 * Reads and edits of the *materialised* sittings, plus the student-facing view
 * of their own appointment.
 *
 * The search that decides who goes where lives in `SlotAssignmentService`; this
 * service is everything after that decision — listing sittings for an admin,
 * resizing one, deleting an empty one, and telling a student when their exam is.
 */
@Injectable()
export class SlotService {
    private readonly logger = new Logger(SlotService.name);

    constructor(
        private prisma: PrismaService,
        private notifications: NotificationService,
        private whatsapp: WhatsAppService,
    ) {}

    // ── Student-facing ────────────────────────────────────────────────────────

    /**
     * The student's own sitting for an exam, or null if they have none yet.
     *
     * Read-only by design. Since sittings are auto-assigned at registration a
     * student no longer picks, cancels or swaps one — the date is fixed the
     * moment they sign up, and only an admin can move them. Everything the
     * schedule page renders comes from here.
     */
    async getMySchedule(userId: string, examId: string) {
        const booking = await this.prisma.booking.findFirst({
            where: {
                userId,
                status: ACTIVE_BOOKING,
                slot: { examInstance: { examId } },
            },
            include: {
                slot: {
                    include: {
                        timing: { select: { id: true, label: true } },
                        examInstance: { include: { exam: true } },
                    },
                },
            },
        });
        if (!booking) return null;

        return {
            bookingId: booking.id,
            status: booking.status,
            slotId: booking.slot.id,
            label: booking.slot.label ?? booking.slot.timing?.label ?? null,
            startsAt: booking.slot.startsAt,
            endsAt: booking.slot.endsAt,
            weekday: weekdayName(istWeekday(booking.slot.startsAt)),
            exam: {
                id: booking.slot.examInstance.exam.id,
                title: booking.slot.examInstance.exam.title,
                durationMinutes: booking.slot.examInstance.exam.durationMinutes,
            },
            examInstanceId: booking.slot.examInstanceId,
        };
    }

    /**
     * One booking by id, scoped to its owner.
     *
     * The ownership check is the point: a booking id in a URL must not let one
     * student read another's sitting and payment. A booking that is not theirs is
     * reported as not found rather than forbidden — "no such booking" and "not
     * yours" should be indistinguishable from outside.
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

    // ── Admin: sittings ───────────────────────────────────────────────────────

    /**
     * Materialised sittings for an instance, newest-relevant first.
     *
     * Defaults to upcoming only: a season's worth of past Sundays is noise on a
     * screen whose job is "who still needs seats".
     */
    async listSittings(examInstanceId: string, opts: { includePast?: boolean } = {}) {
        const slots = await this.prisma.examSlot.findMany({
            where: {
                examInstanceId,
                ...(opts.includePast ? {} : { slotDate: { gte: istStartOfDay(new Date()) } }),
            },
            include: {
                timing: { select: { id: true, label: true, isActive: true } },
                _count: { select: { bookings: true } },
            },
            orderBy: [{ startsAt: 'asc' }],
        });

        return slots.map((slot) => ({
            ...slot,
            weekday: weekdayName(istWeekday(slot.startsAt)),
            seatsLeft: Math.max(0, slot.capacity - slot.booked),
            isFull: slot.booked >= slot.capacity,
        }));
    }

    /** Every sitting across every instance — the admin landing view. */
    async listAllSittings(opts: { includePast?: boolean } = {}) {
        const slots = await this.prisma.examSlot.findMany({
            where: opts.includePast ? {} : { slotDate: { gte: istStartOfDay(new Date()) } },
            include: {
                timing: { select: { id: true, label: true, isActive: true } },
                examInstance: {
                    select: {
                        id: true,
                        startsAt: true,
                        endsAt: true,
                        exam: { select: { id: true, title: true, feeAmount: true } },
                    },
                },
            },
            orderBy: [{ startsAt: 'asc' }],
        });

        return slots.map((slot) => ({
            ...slot,
            weekday: weekdayName(istWeekday(slot.startsAt)),
            seatsLeft: Math.max(0, slot.capacity - slot.booked),
            isFull: slot.booked >= slot.capacity,
        }));
    }

    /** The students in one sitting, for the admin's roster view. */
    async listSittingStudents(slotId: string) {
        return this.prisma.booking.findMany({
            where: { slotId, status: ACTIVE_BOOKING },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        rollNumber: true,
                        classBand: true,
                        school: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * A one-off sitting outside the recurring timings — a make-up date, or a
     * weekday the regular schedule does not cover.
     */
    async createSitting(dto: CreateSlotDto) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: dto.examInstanceId },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');

        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(dto.endsAt);
        const check = validateSlotWindow({ startsAt, endsAt }, instance);
        if (!check.ok) throw new BadRequestException(check.reason);

        return this.prisma.examSlot.create({
            data: {
                examInstanceId: dto.examInstanceId,
                timingId: null,
                slotDate: istStartOfDay(startsAt),
                label: dto.label ?? null,
                startsAt,
                endsAt,
                capacity: dto.capacity ?? 50,
            },
        });
    }

    /**
     * Edits one sitting: its seat count, its label, or its times.
     *
     * Seats are the common case — "this Sunday needs 80, not 50" — and the only
     * hard rule is that capacity can never fall below the students already in it.
     * Allowing that would leave the sitting permanently oversold to every
     * capacity guard that reads it, and there is no sensible answer to which of
     * the seated students loses their place.
     */
    async updateSitting(slotId: string, dto: UpdateSlotDto) {
        const slot = await this.prisma.examSlot.findUnique({
            where: { id: slotId },
            include: { examInstance: true },
        });
        if (!slot) throw new NotFoundException('Sitting not found');

        if (dto.capacity !== undefined && dto.capacity < slot.booked) {
            throw new BadRequestException(
                `${slot.booked} student(s) are already assigned to this sitting, so it cannot be cut to ${dto.capacity} seats. Move students out first.`,
            );
        }

        const startsAt = dto.startsAt ? new Date(dto.startsAt) : slot.startsAt;
        const endsAt = dto.endsAt ? new Date(dto.endsAt) : slot.endsAt;
        if (dto.startsAt || dto.endsAt) {
            const check = validateSlotWindow({ startsAt, endsAt }, slot.examInstance);
            if (!check.ok) throw new BadRequestException(check.reason);
        }

        const updated = await this.prisma.examSlot.update({
            where: { id: slotId },
            data: {
                ...(dto.label !== undefined && { label: dto.label || null }),
                ...(dto.capacity !== undefined && { capacity: dto.capacity }),
                ...(dto.startsAt && { startsAt, slotDate: istStartOfDay(startsAt) }),
                ...(dto.endsAt && { endsAt }),
            },
        });

        // Moving a sitting changes the date every student in it has already been
        // told. They must be re-notified, and this is the only edit that does so.
        if (dto.startsAt || dto.endsAt) {
            const bookings = await this.prisma.booking.findMany({
                where: { slotId, status: BookingStatus.CONFIRMED },
                select: { id: true },
            });
            this.notifyScheduleMany(bookings.map((b) => b.id));
        }

        return updated;
    }

    /**
     * Deletes an empty sitting. A sitting with students in it is never deletable
     * — that would silently strip a cohort of their exam date. Move them first.
     */
    async deleteSitting(slotId: string) {
        const slot = await this.prisma.examSlot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Sitting not found');
        if (slot.booked > 0) {
            throw new BadRequestException(
                `${slot.booked} student(s) are assigned to this sitting. Move them to another one before deleting it.`,
            );
        }
        await this.prisma.examSlot.delete({ where: { id: slotId } });
        return { success: true };
    }

    // ── Admin: one student's schedule ─────────────────────────────────────────

    /**
     * Every sitting a student holds, across all exams — what the admin's student
     * detail page shows, and what they act on when moving someone.
     */
    async getStudentSchedule(userId: string) {
        const bookings = await this.prisma.booking.findMany({
            where: { userId, status: ACTIVE_BOOKING },
            include: {
                slot: {
                    include: {
                        timing: { select: { id: true, label: true } },
                        examInstance: {
                            select: {
                                id: true,
                                startsAt: true,
                                endsAt: true,
                                exam: { select: { id: true, title: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return bookings.map((b) => ({
            bookingId: b.id,
            status: b.status,
            /** Null when the auto-assigner placed them, set when a human did. */
            assignedBy: b.assignedBy,
            slotId: b.slot.id,
            label: b.slot.label ?? b.slot.timing?.label ?? null,
            startsAt: b.slot.startsAt,
            endsAt: b.slot.endsAt,
            weekday: weekdayName(istWeekday(b.slot.startsAt)),
            capacity: b.slot.capacity,
            booked: b.slot.booked,
            examInstanceId: b.slot.examInstanceId,
            exam: b.slot.examInstance.exam,
        }));
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    /**
     * Tells a student when their exam is, on both channels.
     *
     * The email carries the full detail (admit card, portal link, rules); the
     * WhatsApp `bio_schedule` template carries the date and time and points at
     * that email. Sent independently on purpose: a student with no phone number
     * on file still gets the mail, and a WATI outage must not cost anyone their
     * confirmation.
     *
     * Best-effort and never throws. The seat is theirs either way, and failing an
     * assignment over a mail-provider timeout would be a strictly worse outcome
     * for the student. Deduped downstream on `(booking, slot)`, so calling it
     * twice for the same sitting is safe and moving a student genuinely re-sends.
     */
    async notifySchedule(bookingId: string): Promise<void> {
        try {
            const booking = await this.prisma.booking.findUnique({
                where: { id: bookingId },
                include: {
                    slot: { include: { examInstance: { include: { exam: true } } } },
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            rollNumber: true,
                            phone: true,
                            phoneRaw: true,
                        },
                    },
                },
            });
            if (!booking || booking.status !== BookingStatus.CONFIRMED) return;

            if (booking.user.email) {
                await this.notifications.sendSlotConfirmed(booking.user.email, {
                    firstName: booking.user.firstName,
                    examTitle: booking.slot.examInstance.exam.title,
                    slotLabel: booking.slot.label,
                    startsAt: booking.slot.startsAt,
                    endsAt: booking.slot.endsAt,
                    rollNumber: booking.user.rollNumber,
                    bookingId: booking.id,
                });
            }

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
                `Schedule notification failed for booking ${bookingId}: ${(err as Error).message}`,
            );
        }
    }

    /**
     * The same message for a whole cohort — a sitting that has been moved, or a
     * bulk backfill.
     *
     * **Not awaited by its callers, and sequential inside.** Both matter, for
     * opposite reasons: a sitting of 50 students would otherwise make an admin
     * wait on 50 round-trips to WATI (and time the request out), while firing all
     * 50 at once would trip WATI's rate limit and lose most of them. So the
     * caller returns immediately and this drains in the background, one at a time.
     */
    notifyScheduleMany(bookingIds: string[]): void {
        if (!bookingIds.length) return;
        void (async () => {
            for (const id of bookingIds) {
                await this.notifySchedule(id);
            }
            this.logger.log(`Schedule notifications queued for ${bookingIds.length} booking(s).`);
        })();
    }
}
