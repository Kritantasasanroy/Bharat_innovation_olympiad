'use client';

import { autoSubmitCopy, type AutoSubmitCause, type ViolationKind } from '@/lib/examIntegrity';
import { useEffect, useRef, useState } from 'react';

export interface AutoSubmitState {
    cause: AutoSubmitCause;
    /** The rule that ended it, when a rule did. */
    violation?: ViolationKind;
    status: 'warning' | 'submitting' | 'done' | 'failed';
    error?: string;
}

/** How long the "your exam ended because…" screen is held before moving on. */
const ACKNOWLEDGE_SECONDS = 10;

/**
 * How long the student is warned *before* the paper is submitted.
 *
 * The exam previously ended the instant the third violation landed — correct,
 * but from the student's chair indistinguishable from the site crashing. This
 * overlay covers the whole viewport, so nothing can be answered or changed
 * during the countdown; the only thing it buys is the student understanding
 * what is about to happen to their paper before it happens.
 */
const WARNING_SECONDS = 5;

/**
 * The screen a student sees whenever the exam ends without them pressing Submit.
 *
 * The old version of this went straight from "Submitting your exam…" to the
 * feedback page. On a good connection that is under a second, so the student saw
 * their paper vanish and nothing that said why — the single most common thing
 * reported back as "the site crashed and ate my exam".
 *
 * So the submit still fires immediately and unconditionally (answers are already
 * saved server-side; nothing here is negotiable or skippable), but the student is
 * *held* on the explanation until they acknowledge it or {@link
 * ACKNOWLEDGE_SECONDS} pass. The paper is gone either way — this only controls
 * how long the reason stays on screen.
 */
export default function AutoSubmitNotice({
    state,
    maxViolations,
    pauseSeconds,
    onRetry,
    onContinue,
    onWarningElapsed,
}: {
    state: AutoSubmitState;
    maxViolations: number;
    pauseSeconds: number;
    onRetry: () => void;
    onContinue: () => void;
    /** Fired when the pre-submit warning has been shown for long enough. */
    onWarningElapsed: () => void;
}) {
    const copy = autoSubmitCopy(state.cause, {
        maxViolations,
        pauseSeconds,
        violation: state.violation,
    });

    /**
     * Latest-refs for the callbacks.
     *
     * Both countdowns below re-arm a 1s timeout from an effect, so anything in
     * their dependency list that changes more often than once a second stops
     * them dead. The player re-renders every 500ms (the face-popup tick), and an
     * inline arrow prop is a new identity on each of those — which froze the
     * pre-submit countdown at 5 and left the exam never submitting. Holding the
     * callbacks in refs keeps the effects dependent on the count alone.
     */
    const onContinueRef = useRef(onContinue);
    const onWarningElapsedRef = useRef(onWarningElapsed);
    useEffect(() => { onContinueRef.current = onContinue; });
    useEffect(() => { onWarningElapsedRef.current = onWarningElapsed; });

    const [secondsLeft, setSecondsLeft] = useState(ACKNOWLEDGE_SECONDS);

    useEffect(() => {
        if (state.status !== 'done') return;
        if (secondsLeft <= 0) {
            onContinueRef.current();
            return;
        }
        const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [state.status, secondsLeft]);

    const [warningLeft, setWarningLeft] = useState(WARNING_SECONDS);

    useEffect(() => {
        if (state.status !== 'warning') return;
        if (warningLeft <= 0) {
            onWarningElapsedRef.current();
            return;
        }
        const t = setTimeout(() => setWarningLeft((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [state.status, warningLeft]);

    return (
        <div className="exam-terminal-overlay" role="alertdialog" aria-modal="true">
            <div className="glass-card exam-terminal-card">
                {state.status === 'warning' && (
                    <>
                        <div className="exam-terminal-icon" aria-hidden="true">{copy.icon}</div>
                        <h2 className="exam-terminal-title">{copy.title}</h2>
                        <p className="exam-terminal-reason">{copy.reason}</p>
                        <div className="exam-terminal-countdown">
                            <span className="exam-terminal-countdown__number">{warningLeft}</span>
                            <span className="exam-terminal-countdown__label">
                                Submitting your exam in {warningLeft} second{warningLeft === 1 ? '' : 's'}
                            </span>
                        </div>
                        <p className="exam-terminal-detail">{copy.detail}</p>
                        <button
                            type="button"
                            className="btn btn-secondary exam-terminal-action"
                            onClick={onWarningElapsed}
                        >
                            Submit now
                        </button>
                    </>
                )}

                {state.status === 'submitting' && (
                    <>
                        <div className="exam-terminal-icon" aria-hidden="true">{copy.icon}</div>
                        <h2 className="exam-terminal-title">{copy.title}</h2>
                        <p className="exam-terminal-reason">{copy.reason}</p>
                        <div className="exam-terminal-progress">
                            <div className="spinner" />
                            <span>Submitting your answers…</span>
                        </div>
                        <p className="exam-terminal-fineprint">
                            Please do not close this window.
                        </p>
                    </>
                )}

                {state.status === 'done' && (
                    <>
                        <div className="exam-terminal-icon" aria-hidden="true">{copy.icon}</div>
                        <h2 className="exam-terminal-title">{copy.title}</h2>
                        <p className="exam-terminal-reason">{copy.reason}</p>
                        <p className="exam-terminal-detail">{copy.detail}</p>
                        <button
                            type="button"
                            className="btn btn-primary exam-terminal-action"
                            onClick={onContinue}
                        >
                            I understand, continue
                        </button>
                        <p className="exam-terminal-fineprint">
                            Continuing automatically in {secondsLeft}s
                        </p>
                    </>
                )}

                {state.status === 'failed' && (
                    <>
                        <div className="exam-terminal-icon" aria-hidden="true">⚠️</div>
                        <h2 className="exam-terminal-title">Your exam ended, but we could not submit it</h2>
                        <p className="exam-terminal-reason">{copy.reason}</p>
                        <p className="exam-terminal-error">{state.error}</p>
                        <p className="exam-terminal-detail">
                            Every answer you gave is already saved on the server, nothing is lost.
                            Check your internet connection and submit again.
                        </p>
                        <button
                            type="button"
                            className="btn btn-primary exam-terminal-action"
                            onClick={onRetry}
                        >
                            ↻ Submit now
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary exam-terminal-action exam-terminal-action--secondary"
                            onClick={() => { window.location.href = '/results'; }}
                        >
                            Leave and check my results
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
