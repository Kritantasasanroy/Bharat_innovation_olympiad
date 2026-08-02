'use client';

import { useEffect, useRef, useState } from 'react';

/** Hard ceiling. The exam opens at this point whatever is still outstanding. */
export const PREPARE_MAX_SECONDS = 7;

export interface PrepareStep {
    key: string;
    label: string;
    done: boolean;
}

/**
 * The "getting your exam ready" screen.
 *
 * The paper used to open the instant the questions arrived, while face-api was
 * still fetching 6.3 MB of weights and had yet to compile its WebGL shaders.
 * The student got question one immediately and then a stuttering, unresponsive
 * page for the next few seconds — clicks landing late, the timer juddering —
 * which is the worst possible first impression of an exam they have paid for.
 *
 * Nothing here makes the loading faster; {@link preloadFaceModels} on the
 * instructions page does that. What this does is refuse to hand over a paper
 * that is not ready yet, and be honest about the wait instead of hiding it
 * behind a paper that does not work properly.
 *
 * Two rules it must not break:
 *
 *  • **It always ends.** A camera that never yields a frame, a model fetch that
 *    hangs — none of it may leave a student staring at a spinner while their
 *    clock runs. At {@link PREPARE_MAX_SECONDS} the exam opens regardless, which
 *    is why every step below degrades to "slower", never to "blocked".
 *
 *  • **It ends early when it can.** If everything is ready in 1.5s — the common
 *    case once the models are preloaded — the student waits 1.5s, not 7.
 */
export default function ExamPreparingOverlay({
    steps,
    startedAt,
    phase = 'preparing',
    onReady,
}: {
    steps: PrepareStep[];
    /**
     * `preparing` — camera, models and warm-up, all before the attempt exists
     * and therefore before the exam clock starts.
     *
     * `starting` — the attempt is being created. The countdown is gone here
     * because this phase genuinely is on the clock, and showing a timer would
     * imply the student can wait it out. It is one API call.
     */
    phase?: 'preparing' | 'starting';
    /**
     * Epoch ms the preparation began, owned by the player rather than by this
     * component. It is rendered from two different places — the branch where
     * the paper has not arrived yet, and the overlay on top of the loaded
     * exam — and a remount between the two would restart a locally-owned clock,
     * making the ceiling 14 seconds instead of 7. On the student's exam time.
     */
    startedAt: number;
    onReady: () => void;
}) {
    const allDone = steps.every((s) => s.done);
    const doneCount = steps.filter((s) => s.done).length;

    const onReadyRef = useRef(onReady);
    useEffect(() => { onReadyRef.current = onReady; });

    const [elapsed, setElapsed] = useState(() => (Date.now() - startedAt) / 1000);

    useEffect(() => {
        const t = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
        return () => clearInterval(t);
    }, [startedAt]);

    // Two independent exits: everything finished, or the ceiling was reached.
    useEffect(() => {
        if (phase !== 'preparing') return;
        if (allDone || elapsed >= PREPARE_MAX_SECONDS) onReadyRef.current();
    }, [phase, allDone, elapsed]);

    const secondsLeft = Math.max(0, Math.ceil(PREPARE_MAX_SECONDS - elapsed));

    /**
     * The bar tracks real readiness, with a floor that creeps up over the
     * ceiling window so it never looks frozen while a slow step is outstanding.
     * A bar that reflects only completed steps sits dead still through the whole
     * of the model download, which reads as a hang.
     */
    const stepRatio = steps.length ? doneCount / steps.length : 1;
    const timeRatio = Math.min(1, elapsed / PREPARE_MAX_SECONDS);
    const percent = Math.round(Math.min(100, Math.max(stepRatio, timeRatio * 0.9) * 100));

    if (phase === 'starting') {
        return (
            <div className="exam-preparing" role="status" aria-live="polite">
                <div className="exam-preparing__card">
                    <div className="exam-preparing__ring" aria-hidden="true" />
                    <h2 className="exam-preparing__title">Starting your exam…</h2>
                    <p className="exam-preparing__sub">
                        Everything is set up. Fetching your question paper now.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="exam-preparing" role="status" aria-live="polite">
            <div className="exam-preparing__card">
                <div className="exam-preparing__ring" aria-hidden="true">
                    <span className="exam-preparing__count">{secondsLeft}</span>
                </div>

                <h2 className="exam-preparing__title">Getting your exam ready</h2>
                <p className="exam-preparing__sub">
                    Setting up your camera and proctoring before the paper opens. Your exam timer has
                    not started yet — it starts when your questions appear.
                </p>

                <div className="exam-preparing__bar" aria-hidden="true">
                    <div className="exam-preparing__bar-fill" style={{ width: `${percent}%` }} />
                </div>

                <ul className="exam-preparing__steps">
                    {steps.map((step) => (
                        <li
                            key={step.key}
                            className={`exam-preparing__step ${step.done ? 'is-done' : ''}`}
                        >
                            <span className="exam-preparing__step-icon" aria-hidden="true">
                                {step.done ? '✓' : '•'}
                            </span>
                            {step.label}
                        </li>
                    ))}
                </ul>

                <p className="exam-preparing__note">
                    This screen never lasts longer than {PREPARE_MAX_SECONDS} seconds, and none of
                    it comes out of your exam time.
                </p>
            </div>
        </div>
    );
}
