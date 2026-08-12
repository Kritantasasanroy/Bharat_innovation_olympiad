'use client';

import { MASCOT, MascotCue } from '@/lib/mascot';
import { useEffect, useState } from 'react';

/**
 * A mid-exam timer check from Limon.
 *
 * Fires every 30% of the way through the paper, plus a warning in the last three
 * minutes — see `lib/mascot.ts` for the schedule and why it is a fraction of the
 * duration rather than a clock time.
 *
 * ## Why a toast and not a modal
 *
 * The exam is timed. A modal would stop the clock feeling fair — the student
 * loses seconds to a message they did not ask for, mid-question. This slides in at
 * the corner, never takes focus, never blocks a click, and leaves on its own.
 *
 * ## Why it is dismissible *and* auto-dismissing
 *
 * Auto-dismiss so an absorbed student is not interrupted twice; a close button so
 * a distracted one can clear it immediately. Both, because the one thing this must
 * never do is sit on top of an option they are trying to select.
 *
 * ## Why the final warning is a different animal
 *
 * It stays up more than twice as long and is styled as a warning. A timer check
 * that scrolls past unread costs nothing; "three minutes left" read too late
 * costs a student the questions they never went back to. It is still dismissible
 * and still never takes focus — urgency is not a licence to trap anyone.
 */

const AUTO_DISMISS_MS = 9000;
/** The final warning gets longer, because missing it has a real cost. */
const WARNING_DISMISS_MS = 20000;

export default function MascotToast({
    cue,
    answeredCount,
    totalQuestions,
    remainingSeconds,
    onDismiss,
}: {
    cue: MascotCue;
    answeredCount: number;
    totalQuestions: number;
    remainingSeconds: number;
    onDismiss: () => void;
}) {
    const [leaving, setLeaving] = useState(false);
    const isWarning = cue.tone === 'warning';
    const dismissAfter = isWarning ? WARNING_DISMISS_MS : AUTO_DISMISS_MS;

    // Keyed on cue.id so a second cue restarts the timer rather than inheriting
    // the remainder of the first one's.
    useEffect(() => {
        setLeaving(false);
        const hide = setTimeout(() => setLeaving(true), dismissAfter);
        // Unmount after the exit transition, not before, or it vanishes abruptly.
        const remove = setTimeout(onDismiss, dismissAfter + 400);
        return () => {
            clearTimeout(hide);
            clearTimeout(remove);
        };
    }, [cue.id, dismissAfter, onDismiss]);

    // Rounded down, not to nearest: rounding 3:29 up to "4 min left" hands a
    // student half a minute that does not exist, on the one message where the
    // number is the whole point.
    const minutesLeft = Math.max(0, Math.floor(remainingSeconds / 60));
    const unanswered = Math.max(0, totalQuestions - answeredCount);

    return (
        <div
            className={`mascot-toast ${isWarning ? 'is-warning' : ''} ${leaving ? 'is-leaving' : ''}`}
            // Polite, not assertive, even for the warning: this must never
            // interrupt a screen reader mid-question. The student is reading a
            // paper against a clock, and cutting them off mid-sentence to say
            // "three minutes left" costs more than it gives.
            role="status"
            aria-live="polite"
        >
            <div className="mascot-toast__head">
                <span className="mascot-toast__avatar" aria-hidden="true">
                    {isWarning ? '⏳' : MASCOT.avatar}
                </span>
                <span className="mascot-toast__name">
                    {MASCOT.name}
                    <small className="mascot-toast__title">{cue.title}</small>
                </span>
                <button
                    type="button"
                    className="mascot-toast__close"
                    onClick={() => {
                        setLeaving(true);
                        setTimeout(onDismiss, 300);
                    }}
                    aria-label="Dismiss message"
                >
                    ×
                </button>
            </div>

            {/* Facts first: a student mid-paper wants the numbers, not the pep talk. */}
            <p className="mascot-toast__status">
                <strong>{answeredCount}</strong> of <strong>{totalQuestions}</strong> answered ·{' '}
                <strong>
                    {minutesLeft} min
                </strong>{' '}
                left
            </p>

            {/* Only on the warning, and only when it is actionable: with the clock
                running out, "6 still blank" is the single most useful thing on
                screen. Saying it every time would make it wallpaper. */}
            {isWarning && unanswered > 0 && (
                <p className="mascot-toast__urgent">
                    <strong>{unanswered}</strong> {unanswered === 1 ? 'question is' : 'questions are'}{' '}
                    still unanswered.
                </p>
            )}

            <p className="mascot-toast__body">{cue.encouragement}</p>

            <p className="mascot-toast__watch">{MASCOT.watchingLine}</p>
        </div>
    );
}
