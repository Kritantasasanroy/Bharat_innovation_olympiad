/**
 * The invigilation persona and the in-exam timer-check schedule.
 *
 * ## Identity — signed off
 *
 * The character is **Limon**, drawn as the approved Lemon Ideas kids avatar (see
 * `components/limon/LimonAvatar.tsx`). He is one character everywhere: the guide
 * who walks a student through registration, the portal and the trial paper, and
 * the voice of the proctoring messages during an exam — "Limon can't see you"
 * rather than "NO_FACE detected". That consistency is the point of having him at
 * all; a friendly guide who turns into an anonymous system voice the moment
 * something goes wrong is worse than no character.
 *
 * Everything identity-shaped lives in {@link MASCOT} so a change of name or art
 * is a one-object edit rather than a hunt through JSX. Nothing else in the
 * codebase should hard-code the name.
 *
 * ## Why the schedule is a fraction of the paper, not a clock time
 *
 * "Timer checks through Limon every 30% of time passed, and a warning in the
 * last 3 minutes."
 *
 * It used to be fixed minute marks (20 and 40). That silently assumed every
 * paper was about an hour long: on a 90-minute paper both messages landed in the
 * first half and the student heard nothing for the last fifty minutes, and on a
 * 30-minute paper the second one arrived with ten minutes to go telling them
 * there was "plenty of time left". Fractions travel across every duration —
 * 30/60/90% is a third of the way, two thirds, and the final stretch, whatever
 * the paper's length.
 *
 * The last-3-minutes warning is deliberately *not* a fraction. "Finish up" is
 * about absolute time, because how long it takes to check an answer does not
 * scale with the paper.
 *
 * ## Why the cue schedule is a pure function
 *
 * The exam player re-renders on every timer tick, every answer and every
 * proctoring event — many times a second. Deciding "is it time for a message?"
 * inline would fire the same toast repeatedly. {@link nextMascotCue} is pure and
 * takes the set of cues already fired, so the decision is testable in isolation
 * and idempotent by construction.
 */

export interface MascotIdentity {
    /** Display name, as it is written to students. */
    name: string;
    /** The inline fallback for text-only contexts (toasts, emails, page titles). */
    avatar: string;
    /** Shown once per exam, quietly, so the invigilation is never a surprise. */
    watchingLine: string;
}

export const MASCOT: MascotIdentity = {
    name: 'Limon',
    avatar: '🍋',
    watchingLine: 'Limon is keeping an eye out, so just focus on your paper.',
};

/**
 * Elapsed-time marks, as a fraction of the paper's duration, at which a timer
 * check fires. Every 30% of the way through, straight from the brief.
 */
export const MASCOT_CUE_FRACTIONS = [0.3, 0.6, 0.9] as const;

/**
 * How long before the end the final warning fires, in minutes.
 *
 * Three minutes: long enough to finish the question in hand and sweep for
 * blanks, short enough that it reads as "now" rather than as another
 * encouragement message.
 */
export const FINAL_WARNING_MINUTES = 3;

export type MascotCueTone = 'encouragement' | 'warning';

export type MascotCueId = `pct-${number}` | 'final-warning';

export interface MascotCue {
    id: MascotCueId;
    /**
     * Fraction of the paper elapsed when this fires, or `null` for the final
     * warning, which is keyed to time *remaining* instead.
     */
    atFraction: number | null;
    /** How the toast should present it. A warning is not a pep talk. */
    tone: MascotCueTone;
    /** Short heading, so the point lands before the sentence is read. */
    title: string;
    /** The body line. Factual and warm; never evaluative. */
    encouragement: string;
}

/**
 * Copy per cue.
 *
 * Kept factual and warm, and never evaluative — "you're behind" would be exactly
 * the anxiety the doc's "child-friendly · no anxiety from constant warnings"
 * rule exists to prevent. Progress numbers are rendered separately by the toast,
 * from live state, so the copy never has to guess.
 */
const CUE_COPY: Record<MascotCueId, { title: string; encouragement: string }> = {
    'pct-30': {
        title: 'Timer check',
        encouragement:
            "You're about a third of the way through. Keep going at your own pace, there's plenty of time left.",
    },
    'pct-60': {
        title: 'Timer check',
        encouragement:
            'Two thirds of the way through. Great effort so far, remember an unanswered question costs the same as a wrong one, so attempt everything.',
    },
    'pct-90': {
        title: 'Timer check',
        encouragement:
            "Final stretch. Now's a good moment to go back to anything you skipped rather than starting something new.",
    },
    'final-warning': {
        title: `${FINAL_WARNING_MINUTES} minutes left`,
        encouragement:
            'Finish the question you are on, then check that every question has an answer. Your paper is submitted automatically when the timer runs out.',
    },
};

export const MASCOT_CUES: MascotCue[] = [
    ...MASCOT_CUE_FRACTIONS.map((fraction) => {
        const id = `pct-${Math.round(fraction * 100)}` as MascotCueId;
        return {
            id,
            atFraction: fraction,
            tone: 'encouragement' as const,
            title: CUE_COPY[id].title,
            encouragement: CUE_COPY[id].encouragement,
        };
    }),
    {
        id: 'final-warning' as const,
        atFraction: null,
        tone: 'warning' as const,
        title: CUE_COPY['final-warning'].title,
        encouragement: CUE_COPY['final-warning'].encouragement,
    },
];

/**
 * The cue that is due now, or null.
 *
 * @param elapsedSeconds  Seconds since the attempt started.
 * @param durationSeconds The paper's full length. Without it a fraction means
 *                        nothing, so a missing or nonsense duration returns null
 *                        rather than guessing.
 * @param firedCueIds     Cues already shown this attempt.
 *
 * A cue stays due until it has been fired, so a student whose tab was
 * backgrounded across the 60% mark still receives it rather than silently
 * missing it. Only ever returns one cue — two toasts at once would stack and
 * obscure the paper.
 *
 * The final warning is checked **first**. It is the only time-critical message
 * here, and a student who returns to a backgrounded tab with two minutes left
 * needs "finish up" now, not a pep talk they missed twenty minutes ago.
 */
export function nextMascotCue(
    elapsedSeconds: number,
    durationSeconds: number,
    firedCueIds: ReadonlySet<string>,
): MascotCue | null {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return null;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

    // Nothing once the clock has run out. The player is already auto-submitting
    // by then, and any message — "3 minutes left", or a 30% check the student
    // was never shown because their tab was backgrounded — is at best noise over
    // a paper that is closing and at worst actively wrong.
    const remainingSeconds = durationSeconds - elapsedSeconds;
    if (remainingSeconds <= 0) return null;

    const warning = MASCOT_CUES.find((c) => c.id === 'final-warning')!;
    if (remainingSeconds <= FINAL_WARNING_MINUTES * 60 && !firedCueIds.has(warning.id)) {
        return warning;
    }

    const fraction = elapsedSeconds / durationSeconds;
    for (const cue of MASCOT_CUES) {
        if (cue.atFraction == null) continue;
        if (fraction >= cue.atFraction && !firedCueIds.has(cue.id)) return cue;
    }
    return null;
}

/**
 * Suppresses a timer check that would collide with the final warning.
 *
 * On a short paper the 90% mark lands inside the last three minutes, so the
 * student would get "final stretch, go back to what you skipped" and "3 minutes
 * left, finish up" within a minute of each other — two messages saying the same
 * thing, the second contradicting the first's calm. The warning always wins:
 * it is the one that is time-critical.
 *
 * The final warning itself is never suppressed.
 */
export function cueIsWorthShowing(cue: MascotCue, examDurationMinutes: number): boolean {
    if (cue.atFraction == null) return true;
    // An unknown duration must not silence encouragement altogether.
    if (!Number.isFinite(examDurationMinutes) || examDurationMinutes <= 0) return true;

    const remainingMinutes = examDurationMinutes * (1 - cue.atFraction);
    return remainingMinutes > FINAL_WARNING_MINUTES;
}
