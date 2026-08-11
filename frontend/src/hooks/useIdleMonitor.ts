'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "The proctoring system violation thresholds are set to … 20 seconds for mouse
 * tracking inactivity."
 *
 * Watches for the student going completely quiet — no mouse, no key, no touch,
 * no scroll, no wheel — and reports each distinct episode once it passes the
 * threshold.
 *
 * ## Why this is a nudge and not a strike
 *
 * Twenty seconds of stillness is not evidence of anything. A thirteen-year-old
 * re-reading a long word problem, or working one out on paper, touches nothing
 * for well over twenty seconds and is doing exactly what the exam asks of them.
 * Wiring this into the violation counter would end papers for reading, which is
 * the opposite of what proctoring is for.
 *
 * So an episode does two things and no more: it tells the student their screen
 * has been still (which is also the fastest way to notice a frozen page or a
 * dead mouse), and it records an event on the attempt so a human reviewer has
 * the timeline. Escalating it to a counted violation is a one-line change at the
 * call site — see the `onIdle` handler in the player.
 *
 * ## One episode, one report
 *
 * `firedRef` latches when an episode is reported and only clears on real input,
 * so a student who is away for four minutes produces one event, not twelve. The
 * `since` timestamp is the episode's identity, exactly as the face proctor's
 * trackers use it, so a toast dismissed for one episode does not stay dismissed
 * for the next.
 */

const ACTIVITY_EVENTS = [
    'mousemove',
    'mousedown',
    'keydown',
    'wheel',
    'touchstart',
    'scroll',
] as const;

/** How often the elapsed-idle check runs. Cheap: a timestamp comparison. */
const TICK_MS = 1000;

interface UseIdleMonitorOptions {
    /** Off for the trial run, while the paper is gated, and once it is over. */
    enabled: boolean;
    /** Seconds of no input before an episode is reported. */
    thresholdSec: number;
    /** Fired once per idle episode, at the moment it crosses the threshold. */
    onIdle?: (idleSeconds: number) => void;
}

export function useIdleMonitor({ enabled, thresholdSec, onIdle }: UseIdleMonitorOptions) {
    /** Epoch ms the current idle episode began, or null once input resumes. */
    const [idleSince, setIdleSince] = useState<number | null>(null);

    const lastActivityRef = useRef(Date.now());
    const firedRef = useRef(false);
    const onIdleRef = useRef(onIdle);
    useEffect(() => { onIdleRef.current = onIdle; });

    /**
     * Called by the player when it ends an episode for the student — dismissing
     * the nudge counts as input, otherwise the toast would reappear on the very
     * next tick because nothing about the idle clock changed.
     */
    const markActive = useCallback(() => {
        lastActivityRef.current = Date.now();
        firedRef.current = false;
        setIdleSince(null);
    }, []);

    useEffect(() => {
        if (!enabled) {
            // Leaving the monitored state must not leave a stale episode on
            // screen — the fullscreen gate covers the paper, and a student
            // reading it is idle by definition.
            markActive();
            return;
        }

        const onActivity = () => {
            lastActivityRef.current = Date.now();
            if (firedRef.current || idleSince !== null) {
                firedRef.current = false;
                setIdleSince(null);
            }
        };

        for (const event of ACTIVITY_EVENTS) {
            window.addEventListener(event, onActivity, { passive: true });
        }

        const timer = setInterval(() => {
            const idleMs = Date.now() - lastActivityRef.current;
            if (idleMs < thresholdSec * 1000) return;
            if (firedRef.current) return;
            firedRef.current = true;
            setIdleSince(lastActivityRef.current);
            onIdleRef.current?.(Math.round(idleMs / 1000));
        }, TICK_MS);

        return () => {
            for (const event of ACTIVITY_EVENTS) {
                window.removeEventListener(event, onActivity);
            }
            clearInterval(timer);
        };
    }, [enabled, thresholdSec, idleSince, markActive]);

    return { idleSince, markActive };
}
