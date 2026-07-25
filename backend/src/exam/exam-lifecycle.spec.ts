import {
    canPublish,
    canReleaseResults,
    examPhase,
    isStartable,
    isVisibleToStudent,
    validateSlotWindow,
} from './exam-lifecycle';

/**
 * The rules these tests pin down are the ones that were actually broken in
 * production: an unpublished exam was visible, a future exam looked startable, an
 * exam with no questions could be published, results were released for an exam
 * nobody had sat, and slots could be scheduled before the exam opened.
 *
 * They are written against a fixed clock so "now" is never ambiguous.
 */

const at = (iso: string) => new Date(iso);

// The exam runs 10:00 → 12:00 on 1 August.
const WINDOW = { startsAt: at('2026-08-01T10:00:00Z'), endsAt: at('2026-08-01T12:00:00Z') };
// The student's slot is the first hour of it.
const SLOT = { startsAt: at('2026-08-01T10:00:00Z'), endsAt: at('2026-08-01T11:00:00Z') };

const phase = (over: Partial<Parameters<typeof examPhase>[0]> = {}) =>
    examPhase({
        isPublished: true,
        instance: WINDOW,
        slot: SLOT,
        hasSlots: true,
        now: at('2026-08-01T10:30:00Z'),
        ...over,
    });

describe('examPhase — what a student may do, and when', () => {
    describe('publication (items 2 and 3)', () => {
        it('an unpublished exam is DRAFT no matter how its dates read', () => {
            // Squarely inside the window and inside the slot — and still invisible.
            expect(phase({ isPublished: false })).toBe('DRAFT');
        });

        it('a DRAFT exam is never visible to a student', () => {
            expect(isVisibleToStudent('DRAFT')).toBe(false);
        });

        it('a DRAFT exam is never startable', () => {
            expect(isStartable(phase({ isPublished: false }))).toBe(false);
        });

        it('publication alone does not make an exam startable — the window still gates it', () => {
            const p = phase({ isPublished: true, now: at('2026-07-30T09:00:00Z') });
            expect(p).toBe('SCHEDULED');
            expect(isStartable(p)).toBe(false);
        });
    });

    describe('scheduling (items 5 and 11)', () => {
        it('before the exam opens it is SCHEDULED — visible, but not startable', () => {
            const p = phase({ now: at('2026-07-25T00:00:00Z') });
            expect(p).toBe('SCHEDULED');
            // Item 11: the student SEES it (so they can find their slot)...
            expect(isVisibleToStudent(p)).toBe(true);
            // ...item 5: but cannot walk into it early.
            expect(isStartable(p)).toBe(false);
        });

        it('after the exam window closes it is ENDED', () => {
            expect(phase({ now: at('2026-08-01T12:00:01Z') })).toBe('ENDED');
        });

        it('a closed exam window beats a still-open slot — a slot cannot authorise an attempt outside the exam', () => {
            // A misconfigured slot that runs past the exam's own end.
            const runaway = { startsAt: SLOT.startsAt, endsAt: at('2026-08-02T23:00:00Z') };
            expect(phase({ slot: runaway, now: at('2026-08-01T13:00:00Z') })).toBe('ENDED');
        });

        it('the exam window boundaries are inclusive at the start and at the end', () => {
            expect(phase({ now: WINDOW.startsAt })).toBe('OPEN');
            expect(phase({ now: WINDOW.endsAt, slot: WINDOW })).toBe('OPEN');
        });
    });

    describe('slots (item 11 — see the exam, start only when your slot opens)', () => {
        it('inside the exam window but with no slot booked → NEEDS_SLOT', () => {
            const p = phase({ slot: null });
            expect(p).toBe('NEEDS_SLOT');
            expect(isStartable(p)).toBe(false);
        });

        it('slot booked but not open yet → SLOT_UPCOMING, not startable', () => {
            // Exam is open (10:30), but this student sits at 11:00.
            const later = {
                startsAt: at('2026-08-01T11:00:00Z'),
                endsAt: at('2026-08-01T12:00:00Z'),
            };
            const p = phase({ slot: later, now: at('2026-08-01T10:30:00Z') });
            expect(p).toBe('SLOT_UPCOMING');
            expect(isStartable(p)).toBe(false);
        });

        it('the moment the slot opens, the exam becomes startable', () => {
            const p = phase({ now: SLOT.startsAt });
            expect(p).toBe('OPEN');
            expect(isStartable(p)).toBe(true);
        });

        it('once the slot has passed → SLOT_MISSED, even though the exam is still open', () => {
            const p = phase({ now: at('2026-08-01T11:30:00Z') });
            expect(p).toBe('SLOT_MISSED');
            expect(isStartable(p)).toBe(false);
        });

        it('an exam with no slots at all is startable inside its window (practice exams)', () => {
            const p = phase({ hasSlots: false, slot: null });
            expect(p).toBe('OPEN');
            expect(isStartable(p)).toBe(true);
        });

        it('OPEN is the ONLY startable phase', () => {
            const every = [
                'DRAFT',
                'SCHEDULED',
                'NEEDS_SLOT',
                'SLOT_UPCOMING',
                'OPEN',
                'SLOT_MISSED',
                'ENDED',
            ] as const;
            expect(every.filter(isStartable)).toEqual(['OPEN']);
        });
    });
});

describe('canPublish — an exam needs a paper and a schedule (item 3)', () => {
    it('refuses an exam with no questions', () => {
        const result = canPublish({ questionCount: 0, instanceCount: 1 });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/no questions/i);
    });

    it('refuses an exam with questions but no schedule', () => {
        const result = canPublish({ questionCount: 20, instanceCount: 0 });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/no schedule/i);
    });

    it('allows an exam that has both', () => {
        expect(canPublish({ questionCount: 1, instanceCount: 1 }).ok).toBe(true);
    });

    it('reports the missing paper first — it is the more fundamental problem', () => {
        const result = canPublish({ questionCount: 0, instanceCount: 0 });
        expect(result.reason).toMatch(/no questions/i);
    });
});

describe('canReleaseResults — only after the exam is actually over (item 1)', () => {
    const normalized = at('2026-08-01T13:00:00Z');

    it('refuses before the exam has even started', () => {
        const result = canReleaseResults({
            instance: WINDOW,
            normalizedAt: normalized,
            now: at('2026-07-20T00:00:00Z'),
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/not started/i);
    });

    it('refuses while the exam is still running — the cohort is incomplete', () => {
        const result = canReleaseResults({
            instance: WINDOW,
            normalizedAt: normalized,
            now: at('2026-08-01T11:00:00Z'),
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/still in progress/i);
    });

    it('refuses at the exact instant the window closes — the last submission may still be in flight', () => {
        const result = canReleaseResults({
            instance: WINDOW,
            normalizedAt: normalized,
            now: WINDOW.endsAt,
        });
        expect(result.ok).toBe(false);
    });

    it('still refuses after the exam ends if normalization has not run', () => {
        const result = canReleaseResults({
            instance: WINDOW,
            normalizedAt: null,
            now: at('2026-08-02T00:00:00Z'),
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/normaliz/i);
    });

    it('allows release once the exam is over AND normalized', () => {
        const result = canReleaseResults({
            instance: WINDOW,
            normalizedAt: normalized,
            now: at('2026-08-01T12:00:01Z'),
        });
        expect(result.ok).toBe(true);
    });
});

describe('validateSlotWindow — a slot must live inside its exam (item 4)', () => {
    it('refuses a slot that starts before the exam opens', () => {
        const result = validateSlotWindow(
            { startsAt: at('2026-08-01T09:00:00Z'), endsAt: at('2026-08-01T11:00:00Z') },
            WINDOW,
        );
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/before the exam opens/i);
    });

    it('refuses a slot that runs past the exam close', () => {
        const result = validateSlotWindow(
            { startsAt: at('2026-08-01T11:00:00Z'), endsAt: at('2026-08-01T13:00:00Z') },
            WINDOW,
        );
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/after the exam closes/i);
    });

    it('refuses a zero-length or inverted slot', () => {
        expect(
            validateSlotWindow({ startsAt: WINDOW.startsAt, endsAt: WINDOW.startsAt }, WINDOW).ok,
        ).toBe(false);
        expect(
            validateSlotWindow(
                { startsAt: at('2026-08-01T11:00:00Z'), endsAt: at('2026-08-01T10:30:00Z') },
                WINDOW,
            ).ok,
        ).toBe(false);
    });

    it('allows a slot exactly filling the exam window', () => {
        expect(validateSlotWindow(WINDOW, WINDOW).ok).toBe(true);
    });

    it('allows a slot strictly inside the window', () => {
        expect(validateSlotWindow(SLOT, WINDOW).ok).toBe(true);
    });

    it('a slot that is valid can always actually be sat — it never yields SCHEDULED or ENDED mid-slot', () => {
        // The property that makes item 4 matter: if a slot passes validation, then
        // at every instant inside it the exam phase is OPEN — never "not started"
        // or "closed". An out-of-window slot is exactly one that breaks this.
        const slot = { startsAt: at('2026-08-01T10:15:00Z'), endsAt: at('2026-08-01T11:45:00Z') };
        expect(validateSlotWindow(slot, WINDOW).ok).toBe(true);

        for (const now of [slot.startsAt, at('2026-08-01T11:00:00Z'), slot.endsAt]) {
            expect(
                examPhase({ isPublished: true, instance: WINDOW, slot, hasSlots: true, now }),
            ).toBe('OPEN');
        }
    });
});
