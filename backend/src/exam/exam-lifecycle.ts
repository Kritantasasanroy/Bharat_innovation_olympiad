/**
 * The single source of truth for "what can happen to an exam right now".
 *
 * These rules were previously spread across the exam list query, the attempt
 * start gate, the admin publish button and the results page — and disagreed
 * with each other, which is how an unpublished exam stayed visible to students,
 * a paperless exam got published, and results were released for an exam that had
 * not been sat yet.
 *
 * Everything here is pure so it can be exhaustively unit-tested without a
 * database (see `exam-lifecycle.spec.ts`). Callers do the I/O and pass the rows
 * in; the service layer is responsible for *enforcing* what these functions
 * *decide*.
 */

/** What a student can currently do with an exam. Ordered earliest → latest. */
export type ExamPhase =
    /** Not published. The student must not see it at all. */
    | 'DRAFT'
    /** Published, but the exam window has not opened. Visible, not startable. */
    | 'SCHEDULED'
    /** Exam window is open, but the student holds no slot. */
    | 'NEEDS_SLOT'
    /** Exam window is open and the student has a slot — but it is not their turn yet. */
    | 'SLOT_UPCOMING'
    /** The student's slot is open right now. This is the only startable phase. */
    | 'OPEN'
    /** The student's slot has passed, though the exam window is still open. */
    | 'SLOT_MISSED'
    /** The exam window has closed. */
    | 'ENDED';

/** The only phase in which `POST /exams/:id/start` may succeed. */
export const STARTABLE_PHASES: readonly ExamPhase[] = ['OPEN'];

export const isStartable = (phase: ExamPhase): boolean => STARTABLE_PHASES.includes(phase);

/** A student must never see anything that has not been published. */
export const isVisibleToStudent = (phase: ExamPhase): boolean => phase !== 'DRAFT';

export interface Window {
    startsAt: Date;
    endsAt: Date;
}

export interface PhaseInput {
    isPublished: boolean;
    /** The exam instance's overall window. */
    instance: Window;
    /**
     * The slot this student is booked into, if any. `null` means unbooked.
     * `undefined` means the exam runs no slots at all (practice/demo exams),
     * in which case the instance window alone decides.
     */
    slot?: Window | null;
    /** Whether this instance has any slots configured. */
    hasSlots: boolean;
    now: Date;
}

/**
 * The phase an exam is in for one specific student.
 *
 * The ordering matters: publication beats scheduling, scheduling beats slots.
 * An unpublished exam is `DRAFT` no matter how its dates read, and an exam whose
 * window has closed is `ENDED` even if the student's slot somehow still looks
 * open — a slot can never authorise an attempt outside the exam window.
 */
export function examPhase(input: PhaseInput): ExamPhase {
    const { isPublished, instance, slot, hasSlots, now } = input;

    if (!isPublished) return 'DRAFT';
    if (now < instance.startsAt) return 'SCHEDULED';
    if (now > instance.endsAt) return 'ENDED';

    // Exam window is open. Without slots, that is the whole gate.
    if (!hasSlots) return 'OPEN';

    if (!slot) return 'NEEDS_SLOT';
    if (now < slot.startsAt) return 'SLOT_UPCOMING';
    if (now > slot.endsAt) return 'SLOT_MISSED';
    return 'OPEN';
}

/** Human-readable reason a start was refused, for the API error message. */
export function startRefusalReason(phase: ExamPhase): string | null {
    switch (phase) {
        case 'DRAFT':
            return 'This exam is not available.';
        case 'SCHEDULED':
            return 'This exam has not opened yet.';
        case 'NEEDS_SLOT':
            return 'You need a confirmed slot booking to start this exam.';
        case 'SLOT_UPCOMING':
            return 'Your slot has not opened yet. You can start once it begins.';
        case 'SLOT_MISSED':
            return 'Your booked slot has passed.';
        case 'ENDED':
            return 'This exam window has closed.';
        case 'OPEN':
            return null;
    }
}

// ─── Admin-side gates ────────────────────────────────────────────────────────

export interface PublishCheck {
    /** How many questions are attached to the exam's sections, in total. */
    questionCount: number;
    /** How many scheduled instances the exam has. */
    instanceCount: number;
}

/**
 * An exam may only be published once it actually has a paper. Publishing an
 * empty exam puts a start button in front of students that leads to a zero
 * question attempt, which then scores 0/N for everyone who touches it.
 */
export function canPublish(check: PublishCheck): { ok: boolean; reason?: string } {
    if (check.questionCount === 0) {
        return {
            ok: false,
            reason:
                'This exam has no questions. Add a question paper (Manage Questions & Sections) before publishing.',
        };
    }
    if (check.instanceCount === 0) {
        return {
            ok: false,
            reason: 'This exam has no schedule. Add an exam instance (date window) before publishing.',
        };
    }
    return { ok: true };
}

export interface ReleaseCheck {
    instance: Window;
    normalizedAt: Date | null;
    now: Date;
}

/**
 * Results can only be released for an exam that has actually finished.
 *
 * Releasing before the window closes would publish a "final" rank and percentile
 * computed over the students who happened to have submitted so far, and every
 * student still mid-attempt would be ranked against a cohort they were never
 * part of. It is also simply wrong to tell a student their result for an exam
 * they have not sat yet.
 */
export function canReleaseResults(check: ReleaseCheck): { ok: boolean; reason?: string } {
    if (check.now < check.instance.startsAt) {
        return { ok: false, reason: 'This exam has not started yet. Results cannot be released.' };
    }
    if (check.now <= check.instance.endsAt) {
        return {
            ok: false,
            reason:
                'This exam is still in progress. Results can only be released after the exam window closes.',
        };
    }
    if (!check.normalizedAt) {
        return { ok: false, reason: 'Run fair-score normalization before releasing results.' };
    }
    return { ok: true };
}

// ─── Slot scheduling ─────────────────────────────────────────────────────────

/**
 * A slot must sit inside its exam instance's window.
 *
 * A slot starting before the exam opens is unusable: the attempt gate refuses
 * every start before `instance.startsAt`, so students booked into it would watch
 * their slot tick away against a Start button that never enables. A slot running
 * past `instance.endsAt` has the same problem at the other end.
 */
export function validateSlotWindow(
    slot: Window,
    instance: Window,
): { ok: boolean; reason?: string } {
    if (slot.endsAt <= slot.startsAt) {
        return { ok: false, reason: 'Slot must end after it starts.' };
    }
    if (slot.startsAt < instance.startsAt) {
        return {
            ok: false,
            reason: `Slot starts before the exam opens (${instance.startsAt.toISOString()}). Move the slot, or open the exam earlier.`,
        };
    }
    if (slot.endsAt > instance.endsAt) {
        return {
            ok: false,
            reason: `Slot ends after the exam closes (${instance.endsAt.toISOString()}). Move the slot, or extend the exam window.`,
        };
    }
    return { ok: true };
}
