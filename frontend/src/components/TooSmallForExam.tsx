'use client';

import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH } from '@/lib/constants';
import { TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Shown when a device is too small to sit an exam on.
 *
 * The rest of the portal is responsive down to a phone. The exam player is not,
 * deliberately: it is a three-pane layout (header, question, question navigator)
 * and the published requirement is 1024×768. Squeezing it onto a 360px screen
 * would either hide the navigator — so a student cannot see which questions they
 * have missed — or overlap the options, mid-exam, under time pressure.
 *
 * What this replaces: a device-compatibility row reading "Screen Resolution ✗"
 * with a disabled Start button and no explanation. A student on a phone had no way
 * to know a phone was the problem.
 *
 * Since the exam now enters fullscreen on Start, a small *window* is no longer
 * a reason to be here — only a small *screen* is. A tablet held in portrait is
 * told to turn it rather than told to go away, because rotating genuinely fixes
 * it and `useDeviceCheck` re-checks on `orientationchange`.
 */
export default function TooSmallForExam() {
    const [screen, setScreen] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const read = () => setScreen({ w: window.screen.width, h: window.screen.height });
        read();
        window.addEventListener('resize', read);
        window.addEventListener('orientationchange', read);
        return () => {
            window.removeEventListener('resize', read);
            window.removeEventListener('orientationchange', read);
        };
    }, []);

    // Wide enough the long way round, just being held the wrong way round.
    const onlyRotationNeeded =
        screen !== null &&
        Math.max(screen.w, screen.h) >= MIN_VIEWPORT_WIDTH &&
        Math.min(screen.w, screen.h) >= MIN_VIEWPORT_HEIGHT &&
        screen.w < screen.h;

    return (
        <div className="too-small">
            <div className="too-small__card glass-card">
                <div className="too-small__icon" aria-hidden="true">
                    {onlyRotationNeeded ? '🔄' : '💻'}
                </div>

                {onlyRotationNeeded ? (
                    <>
                        <h1>Turn your device sideways</h1>
                        <p className="too-small__lede">
                            Your screen is big enough, it just needs to be landscape. Rotate it and
                            this will clear on its own.
                        </p>
                    </>
                ) : (
                    <>
                        <h1>This device is too small for the exam</h1>
                        <p className="too-small__lede">
                            The Olympiad Innovation Olympiad exam needs a laptop, desktop, or a tablet. A phone screen
                            cannot show the question list and the Innovation Olympiad exam side by side, and we would
                                rather tell you now than halfway through your exam.
                        </p>
                    </>
                )}

                <dl className="too-small__req">
                    <div className="tech-req-row">
                        <dt>Needed</dt>
                        <dd>
                            {MIN_VIEWPORT_WIDTH} × {MIN_VIEWPORT_HEIGHT} or larger
                        </dd>
                    </div>
                    {screen && (
                        <div className="tech-req-row">
                            <dt>This screen</dt>
                            <dd>
                                {screen.w} × {screen.h}
                            </dd>
                        </div>
                    )}
                </dl>

                {!onlyRotationNeeded && (
                    <>
                        <p className="too-small__sub">Everything you need for the exam:</p>
                        <dl className="tech-req-list">
                            {TECH_REQUIREMENTS.map((req) => (
                                <div key={req.label} className="tech-req-row">
                                    <dt>{req.label}</dt>
                                    <dd>{req.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </>
                )}

                <p className="too-small__note">
                    Everything else (your dashboard, results, certificates and your slot) works
                    fine on this device. It is only the exam itself that needs a bigger screen.
                </p>

                <Link href="/dashboard" className="btn btn-primary">
                    Back to my dashboard
                </Link>
            </div>
        </div>
    );
}
