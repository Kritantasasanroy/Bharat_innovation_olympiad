import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Derive the printable admit-card number from a booking. Stable, no new table. */
export function admitCardNumber(bookingId: string, year: number): string {
    return `AC-${year}-${bookingId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Admit card (spec Student §17).
 *
 * The consent half of this module is gone: the standalone consent page was
 * dropped from the flow, and what it recorded is covered by the parental and
 * data consents captured inside the student-identification form — the
 * `GuardianProfile` columns `parentalConsentAt`/`dataConsentAt` are the record
 * the exam gate reads, not a separate table.
 *
 * Rendered as a printable page by the student app — no Puppeteer/Chromium on
 * the server.
 */
@Injectable()
export class ConsentService {
    constructor(private prisma: PrismaService) {}

    /**
     * Admit card for a confirmed booking (ownership-checked).
     */
    async admitCard(userId: string, bookingId: string) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                user: { select: { firstName: true, lastName: true, email: true, classBand: true } },
                slot: { include: { examInstance: { include: { exam: true } } } },
            },
        });
        if (!booking || booking.userId !== userId) throw new NotFoundException('Booking not found');
        if (booking.status !== BookingStatus.CONFIRMED) {
            throw new BadRequestException('An admit card is issued only for a confirmed booking.');
        }

        const { slot } = booking;
        const { exam } = slot.examInstance;

        return {
            admitCardNumber: admitCardNumber(booking.id, slot.startsAt.getFullYear()),
            student: {
                name: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
                email: booking.user.email,
                classBand: booking.user.classBand,
            },
            exam: {
                title: exam.title,
                durationMinutes: exam.durationMinutes,
                totalMarks: exam.totalMarks,
            },
            slot: { label: slot.label, startsAt: slot.startsAt, endsAt: slot.endsAt },
            requireSeb: slot.examInstance.requireSeb,
            instructions: [
                'Arrive and sign in at least 15 minutes before your slot begins.',
                'Keep a working webcam enabled for the whole exam — AI proctoring is active.',
                'Stay in fullscreen. Leaving fullscreen or switching tabs is recorded as a violation.',
                'A government or school photo ID must be available for verification.',
                'The timer is server-authoritative: it keeps running if you disconnect.',
            ],
        };
    }
}
