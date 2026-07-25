import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Bump when the consent text changes; students are then asked to re-consent. */
export const CURRENT_CONSENT_VERSION = '2026-07-v1';

/** Derive the printable admit-card number from a booking. Stable, no new table. */
export function admitCardNumber(bookingId: string, year: number): string {
    return `AC-${year}-${bookingId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Consent capture (spec Student §6) and admit card (spec Student §17).
 *
 * Consent is stored permanently and versioned: a policy change bumps
 * {@link CURRENT_CONSENT_VERSION} and the student is asked again, without the
 * earlier record being overwritten (the unique key is user+version).
 *
 * All three permissions must be granted — the platform cannot run a proctored
 * exam without media capture and monitoring consent, so a partial consent is
 * rejected rather than silently stored.
 */
@Injectable()
export class ConsentService {
    constructor(private prisma: PrismaService) {}

    async accept(
        userId: string,
        input: { dataProcessing: boolean; mediaCapture: boolean; proctoring: boolean },
        ipAddress?: string,
    ) {
        if (!input.dataProcessing || !input.mediaCapture || !input.proctoring) {
            throw new BadRequestException(
                'All three permissions are required to sit a proctored exam.',
            );
        }

        return this.prisma.consent.upsert({
            where: { userId_version: { userId, version: CURRENT_CONSENT_VERSION } },
            create: {
                userId,
                version: CURRENT_CONSENT_VERSION,
                dataProcessing: true,
                mediaCapture: true,
                proctoring: true,
                ...(ipAddress ? { ipAddress } : {}),
            },
            update: { acceptedAt: new Date(), ...(ipAddress ? { ipAddress } : {}) },
        });
    }

    /** Current consent state for the signed-in student. */
    async status(userId: string) {
        const consent = await this.prisma.consent.findUnique({
            where: { userId_version: { userId, version: CURRENT_CONSENT_VERSION } },
        });
        return {
            version: CURRENT_CONSENT_VERSION,
            accepted: Boolean(consent),
            acceptedAt: consent?.acceptedAt ?? null,
        };
    }

    /**
     * Admit card for a confirmed booking (ownership-checked). Rendered as a
     * printable page by the student app — no Puppeteer/Chromium on the server.
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
