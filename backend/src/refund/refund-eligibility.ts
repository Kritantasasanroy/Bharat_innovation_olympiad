/**
 * Refund eligibility (spec Student §14 — "Refund Eligibility Check", Automatic).
 *
 * The rule, verbatim from the spec: *"refunds only before the cutoff, and no
 * refund once a slot is booked."*
 *
 * Pure so it can be unit-tested and, importantly, so the *same* function runs
 * both when the student requests a refund and again when an admin approves it —
 * a request that was eligible last week must not be paid out after the cutoff
 * has since passed.
 */

import { BookingStatus, PaymentStatus } from '@prisma/client';

/** How long before the exam starts the refund window closes. */
export const REFUND_CUTOFF_HOURS = 48;

export interface RefundEligibilityInput {
    readonly paymentStatus: PaymentStatus;
    /** The booking this payment covers, if any. */
    readonly bookingStatus: BookingStatus | null;
    /** When the booked slot (or the exam instance) starts. Null when unknown. */
    readonly examStartsAt: Date | null;
    readonly now: Date;
    readonly cutoffHours?: number;
}

export type RefundIneligibleReason =
    | 'NOT_PAID'
    | 'ALREADY_REFUNDED'
    | 'SLOT_CONFIRMED'
    | 'CUTOFF_PASSED';

export type RefundEligibility =
    | { readonly eligible: true; readonly note: string }
    | { readonly eligible: false; readonly reason: RefundIneligibleReason; readonly note: string };

export function evaluateRefundEligibility(input: RefundEligibilityInput): RefundEligibility {
    if (input.paymentStatus === PaymentStatus.REFUNDED) {
        return { eligible: false, reason: 'ALREADY_REFUNDED', note: 'This payment has already been refunded.' };
    }
    if (input.paymentStatus !== PaymentStatus.PAID) {
        return { eligible: false, reason: 'NOT_PAID', note: 'Only a successful payment can be refunded.' };
    }
    if (input.bookingStatus === BookingStatus.CONFIRMED) {
        return {
            eligible: false,
            reason: 'SLOT_CONFIRMED',
            note: 'A slot has already been booked; no refund is available once a seat is held.',
        };
    }

    if (input.examStartsAt) {
        const cutoffHours = input.cutoffHours ?? REFUND_CUTOFF_HOURS;
        const cutoff = new Date(input.examStartsAt.getTime() - cutoffHours * 60 * 60 * 1000);
        if (input.now.getTime() >= cutoff.getTime()) {
            return {
                eligible: false,
                reason: 'CUTOFF_PASSED',
                note: `The refund window closed ${cutoffHours} hours before the exam.`,
            };
        }
    }

    return { eligible: true, note: 'Within the refund window and no seat is held.' };
}
