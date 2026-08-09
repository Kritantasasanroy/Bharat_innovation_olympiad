'use client';

import { useEffect, useState } from 'react';

/**
 * A small, non-blocking proctoring notice.
 *
 * Replaces the center-screen backdrop popup that used to stop a student
 * answering — full black overlay, an OK button they had to click before they
 * could touch the paper again — for something that just informed them (no
 * face detected, looking away, camera issues) without taking the exam away
 * from them mid-question. It reports the same information; it just does not
 * demand a response first.
 *
 * Auto-dismissing *and* closable, same reasoning as {@link MascotToast}: a
 * student absorbed in a question should not have to act on it, and one who
 * wants it gone immediately should be able to clear it.
 */

export interface ProctorToastData {
    /** Identity of the notice — a fresh episode gets a new key so a
     *  previously-dismissed toast of the same kind reappears. */
    key: string;
    icon: string;
    title: string;
    message: string;
    /** Longer-lived notices (a sustained face issue) stay up longer than a
     *  one-off confirmation ("photo captured"). */
    durationMs?: number;
}

const DEFAULT_DURATION_MS = 6000;

export default function ProctorToast({
    data,
    /** Separate corner per concern so two unrelated notices (a face issue
     *  and a "photo captured" confirmation) can never land on top of each
     *  other — each has its own fixed slot rather than a shared queue. */
    position = 'top-left',
    onDismiss,
}: {
    data: ProctorToastData;
    position?: 'top-left' | 'bottom-left';
    onDismiss: () => void;
}) {
    const [leaving, setLeaving] = useState(false);
    const duration = data.durationMs ?? DEFAULT_DURATION_MS;

    useEffect(() => {
        setLeaving(false);
        const hide = setTimeout(() => setLeaving(true), duration);
        const remove = setTimeout(onDismiss, duration + 300);
        return () => {
            clearTimeout(hide);
            clearTimeout(remove);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on data.key so a new episode restarts the timer
    }, [data.key, duration, onDismiss]);

    return (
        <div
            className={`proctor-toast proctor-toast--${position} ${leaving ? 'is-leaving' : ''}`}
            role="status"
            aria-live="polite"
        >
            <span className="proctor-toast__icon" aria-hidden="true">{data.icon}</span>
            <div className="proctor-toast__body">
                <strong className="proctor-toast__title">{data.title}</strong>
                <p className="proctor-toast__message">{data.message}</p>
            </div>
            <button
                type="button"
                className="proctor-toast__close"
                onClick={() => {
                    setLeaving(true);
                    setTimeout(onDismiss, 250);
                }}
                aria-label="Dismiss notice"
            >
                ×
            </button>
        </div>
    );
}
