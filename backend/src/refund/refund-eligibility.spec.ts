import { BookingStatus, PaymentStatus } from '@prisma/client';
import { evaluateRefundEligibility, REFUND_CUTOFF_HOURS } from './refund-eligibility';

const NOW = new Date('2026-08-01T00:00:00.000Z');
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

const base = {
    paymentStatus: PaymentStatus.PAID,
    bookingStatus: null,
    examStartsAt: hoursFromNow(REFUND_CUTOFF_HOURS + 1),
    now: NOW,
};

describe('evaluateRefundEligibility', () => {
    it('allows a refund on a paid, unbooked payment well before the cutoff', () => {
        const verdict = evaluateRefundEligibility(base);
        expect(verdict.eligible).toBe(true);
    });

    it('refuses a payment that was never completed', () => {
        const verdict = evaluateRefundEligibility({ ...base, paymentStatus: PaymentStatus.CREATED });
        expect(verdict).toMatchObject({ eligible: false, reason: 'NOT_PAID' });
    });

    it('refuses a failed payment', () => {
        const verdict = evaluateRefundEligibility({ ...base, paymentStatus: PaymentStatus.FAILED });
        expect(verdict).toMatchObject({ eligible: false, reason: 'NOT_PAID' });
    });

    it('refuses an already-refunded payment (never pay out twice)', () => {
        const verdict = evaluateRefundEligibility({ ...base, paymentStatus: PaymentStatus.REFUNDED });
        expect(verdict).toMatchObject({ eligible: false, reason: 'ALREADY_REFUNDED' });
    });

    it('refuses once a slot booking is CONFIRMED, even well before the cutoff', () => {
        const verdict = evaluateRefundEligibility({
            ...base,
            bookingStatus: BookingStatus.CONFIRMED,
            examStartsAt: hoursFromNow(24 * 30),
        });
        expect(verdict).toMatchObject({ eligible: false, reason: 'SLOT_CONFIRMED' });
    });

    it('still allows a refund when a booking exists but is only PENDING', () => {
        const verdict = evaluateRefundEligibility({ ...base, bookingStatus: BookingStatus.PENDING });
        expect(verdict.eligible).toBe(true);
    });

    it('still allows a refund when the booking was CANCELLED', () => {
        const verdict = evaluateRefundEligibility({ ...base, bookingStatus: BookingStatus.CANCELLED });
        expect(verdict.eligible).toBe(true);
    });

    it('refuses once the cutoff has passed', () => {
        const verdict = evaluateRefundEligibility({
            ...base,
            examStartsAt: hoursFromNow(REFUND_CUTOFF_HOURS - 1),
        });
        expect(verdict).toMatchObject({ eligible: false, reason: 'CUTOFF_PASSED' });
    });

    it('treats the cutoff boundary as closed (>=, not >)', () => {
        const verdict = evaluateRefundEligibility({
            ...base,
            examStartsAt: hoursFromNow(REFUND_CUTOFF_HOURS),
        });
        expect(verdict).toMatchObject({ eligible: false, reason: 'CUTOFF_PASSED' });
    });

    it('refuses after the exam has already started', () => {
        const verdict = evaluateRefundEligibility({ ...base, examStartsAt: hoursFromNow(-1) });
        expect(verdict).toMatchObject({ eligible: false, reason: 'CUTOFF_PASSED' });
    });

    it('honours a custom cutoff window', () => {
        const eightHoursOut = { ...base, examStartsAt: hoursFromNow(8) };
        expect(evaluateRefundEligibility({ ...eightHoursOut, cutoffHours: 4 }).eligible).toBe(true);
        expect(evaluateRefundEligibility({ ...eightHoursOut, cutoffHours: 12 }).eligible).toBe(false);
    });

    it('skips the cutoff check entirely when no exam date is known', () => {
        const verdict = evaluateRefundEligibility({ ...base, examStartsAt: null });
        expect(verdict.eligible).toBe(true);
    });

    it('checks payment state before booking state, so a refunded+booked payment reports ALREADY_REFUNDED', () => {
        const verdict = evaluateRefundEligibility({
            ...base,
            paymentStatus: PaymentStatus.REFUNDED,
            bookingStatus: BookingStatus.CONFIRMED,
        });
        expect(verdict).toMatchObject({ eligible: false, reason: 'ALREADY_REFUNDED' });
    });

    it('always attaches a human-readable note', () => {
        expect(evaluateRefundEligibility(base).note).toBeTruthy();
        expect(
            evaluateRefundEligibility({ ...base, bookingStatus: BookingStatus.CONFIRMED }).note,
        ).toContain('slot');
    });
});
