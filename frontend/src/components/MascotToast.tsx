'use client';

import { MASCOT, MascotCue } from '@/lib/mascot';
import { useEffect, useState } from 'react';

/**
 * A mid-exam encouragement toast.
 *
 * "Motivating messages at 20, 40 mins window with status, encouragement and Our
 * smart invigilator is watching you."
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
 */

const AUTO_DISMISS_MS = 9000;

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

    // Keyed on cue.id so a second cue restarts the timer rather than inheriting
    // the remainder of the first one's.
    useEffect(() => {
        setLeaving(false);
        const hide = setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);
        // Unmount after the exit transition, not before, or it vanishes abruptly.
        const remove = setTimeout(onDismiss, AUTO_DISMISS_MS + 400);
        return () => {
            clearTimeout(hide);
            clearTimeout(remove);
        };
    }, [cue.id, onDismiss]);

    const minutesLeft = Math.max(0, Math.round(remainingSeconds / 60));

    return (
        <div
            className={`mascot-toast ${leaving ? 'is-leaving' : ''}`}
            // Polite, not assertive: this must never interrupt a screen reader
            // mid-question.
            role="status"
            aria-live="polite"
        >
            <div className="mascot-toast__head">
                <span className="mascot-toast__avatar" aria-hidden="true">{MASCOT.avatar}</span>
                <span className="mascot-toast__name">{MASCOT.name}</span>
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
                <strong>{minutesLeft} min</strong> left
            </p>

            <p className="mascot-toast__body">{cue.encouragement}</p>

            <p className="mascot-toast__watch">{MASCOT.watchingLine}</p>
        </div>
    );
}
