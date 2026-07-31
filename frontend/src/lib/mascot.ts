/**
 * The invigilation persona and the in-exam encouragement schedule.
 *
 * ## Placeholder identity — read before renaming
 *
 * The persona ("A character for communication and invigilation — Smart persona
 * with an interesting new name like LIMON ??") is **not signed off**. `LIMON` is
 * a working name taken from that note.
 *
 * Everything identity-shaped lives in {@link MASCOT} so approving a different
 * name and art is a one-object edit rather than a hunt through JSX. Nothing else
 * in the codebase should hard-code the name.
 *
 * ## Why the cue schedule is a pure function
 *
 * "Motivating messages at 20, 40 mins window with status, encouragement and Our
 * smart invigilator is watching you."
 *
 * The exam player re-renders on every timer tick, every answer and every
 * proctoring event — many times a second. Deciding "is it time for a message?"
 * inline would fire the same toast repeatedly. {@link nextMascotCue} is pure and
 * takes the set of cues already fired, so the decision is testable in isolation
 * and idempotent by construction.
 */

export interface MascotIdentity {
    /** Display name. Placeholder — see the file header before changing. */
    name: string;
    /** Rendered next to the name. An emoji avoids shipping an asset for a placeholder. */
    avatar: string;
    /** Shown once per exam, quietly, so the invigilation is never a surprise. */
    watchingLine: string;
}

export const MASCOT: MascotIdentity = {
    name: 'LIMON',
    avatar: '🍋',
    watchingLine: 'Our smart invigilator is keeping an eye out — just focus on your paper.',
};

/** Elapsed-time marks, in minutes, at which a message fires. Straight from the doc. */
export const MASCOT_CUE_MINUTES = [20, 40] as const;

export type MascotCueId = `min-${number}`;

export interface MascotCue {
    id: MascotCueId;
    atMinute: number;
    /** The encouragement line. Deliberately free of scores or judgement. */
    encouragement: string;
}

/**
 * Encouragement per cue.
 *
 * Kept factual and warm, and never evaluative — "you're behind" would be exactly
 * the anxiety the doc's "child-friendly · no anxiety from constant warnings"
 * rule exists to prevent. Progress numbers are rendered separately by the toast,
 * from live state, so the copy never has to guess.
 */
const CUE_COPY: Record<MascotCueId, string> = {
    'min-20': "You're well into it now. Keep going at your own pace — there's plenty of time left.",
    'min-40': 'Great effort so far. Take a breath, and remember an unanswered question costs the same as a wrong one — so attempt everything.',
};

export const MASCOT_CUES: MascotCue[] = MASCOT_CUE_MINUTES.map((minute) => ({
    id: `min-${minute}` as MascotCueId,
    atMinute: minute,
    encouragement: CUE_COPY[`min-${minute}` as MascotCueId] ?? '',
}));

/**
 * The cue that is due now, or null.
 *
 * @param elapsedSeconds Seconds since the attempt started.
 * @param firedCueIds    Cues already shown this attempt.
 *
 * A cue stays due until it has been fired, so a student whose tab was backgrounded
 * across the 20-minute mark still receives it rather than silently missing it.
 * Only ever returns one cue — two toasts at once would stack and obscure the paper.
 */
export function nextMascotCue(
    elapsedSeconds: number,
    firedCueIds: ReadonlySet<string>,
): MascotCue | null {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return null;
    const elapsedMinutes = elapsedSeconds / 60;

    for (const cue of MASCOT_CUES) {
        if (elapsedMinutes >= cue.atMinute && !firedCueIds.has(cue.id)) return cue;
    }
    return null;
}

/**
 * Suppresses cues that would land too near the end of a short paper.
 *
 * A 25-minute paper would otherwise get a "plenty of time left" message with
 * five minutes to go, which is worse than saying nothing. A cue is only used if
 * at least this many minutes of the paper remain after it.
 */
export const MIN_REMAINING_MINUTES_FOR_CUE = 5;

export function cueIsWorthShowing(cue: MascotCue, examDurationMinutes: number): boolean {
    if (!Number.isFinite(examDurationMinutes) || examDurationMinutes <= 0) return true;
    return examDurationMinutes - cue.atMinute >= MIN_REMAINING_MINUTES_FOR_CUE;
}
