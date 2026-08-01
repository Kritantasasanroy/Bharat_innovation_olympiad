import { examPhase, isStartable, startRefusalReason } from './exam-lifecycle';

/**
 * Waiving the slot requirement (`Exam.requiresSlot = false`).
 *
 * The waiver is expressed by passing `hasSlots: false` even when the instance
 * genuinely has slots configured — the callers in `exam.service.ts` and
 * `attempt.service.ts` both do that. These tests pin the two things that matter:
 *
 *  - a waived exam is startable for its whole window, with no booking;
 *  - waiving the slot does NOT waive anything else. Publication and the exam
 *    window still gate it, so "available all the time" cannot accidentally mean
 *    "available before it is published" or "available forever".
 */
describe('slot waiver', () => {
    const HOUR = 60 * 60 * 1000;
    const now = new Date('2026-08-01T12:00:00Z');
    const openWindow = {
        startsAt: new Date(now.getTime() - 4 * HOUR),
        endsAt: new Date(now.getTime() + 4 * HOUR),
    };

    describe('with the slot requirement waived', () => {
        const waived = { isPublished: true, instance: openWindow, hasSlots: false, now };

        it('is OPEN with no booking at all', () => {
            expect(examPhase(waived)).toBe('OPEN');
            expect(isStartable(examPhase(waived))).toBe(true);
        });

        it('is OPEN even mid-window, at any moment', () => {
            for (const offset of [-3.9, -2, 0, 2, 3.9]) {
                const at = new Date(now.getTime() + offset * HOUR);
                expect(examPhase({ ...waived, now: at })).toBe('OPEN');
            }
        });

        it('never reports NEEDS_SLOT, so no student is sent to a picker', () => {
            expect(examPhase(waived)).not.toBe('NEEDS_SLOT');
            expect(startRefusalReason(examPhase(waived))).toBeNull();
        });

        it('ignores a slot the student happens to hold, even a missed one', () => {
            // Students auto-allocated by their school keep a booking. Once the
            // requirement is waived, a passed slot must not lock them out.
            const missed = {
                startsAt: new Date(now.getTime() - 3 * HOUR),
                endsAt: new Date(now.getTime() - 2 * HOUR),
            };
            expect(examPhase({ ...waived, slot: missed })).toBe('OPEN');
        });
    });

    describe('waiving the slot waives nothing else', () => {
        it('still hides an unpublished exam', () => {
            expect(examPhase({ isPublished: false, instance: openWindow, hasSlots: false, now })).toBe(
                'DRAFT',
            );
        });

        it('still refuses before the window opens', () => {
            const future = {
                startsAt: new Date(now.getTime() + HOUR),
                endsAt: new Date(now.getTime() + 4 * HOUR),
            };
            expect(examPhase({ isPublished: true, instance: future, hasSlots: false, now })).toBe(
                'SCHEDULED',
            );
        });

        it('still refuses after the window closes', () => {
            // The reason the window matters: "no slot needed" is not "forever".
            const past = {
                startsAt: new Date(now.getTime() - 4 * HOUR),
                endsAt: new Date(now.getTime() - HOUR),
            };
            const phase = examPhase({ isPublished: true, instance: past, hasSlots: false, now });
            expect(phase).toBe('ENDED');
            expect(isStartable(phase)).toBe(false);
        });
    });

    describe('with the slot requirement in force (the default)', () => {
        const enforced = { isPublished: true, instance: openWindow, hasSlots: true, now };

        it('still demands a booking', () => {
            expect(examPhase({ ...enforced, slot: null })).toBe('NEEDS_SLOT');
        });

        it('still holds a student to their own sitting', () => {
            const later = {
                startsAt: new Date(now.getTime() + HOUR),
                endsAt: new Date(now.getTime() + 2 * HOUR),
            };
            expect(examPhase({ ...enforced, slot: later })).toBe('SLOT_UPCOMING');
        });
    });
});
