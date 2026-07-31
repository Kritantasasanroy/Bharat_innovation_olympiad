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
 */
export default function TooSmallForExam() {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);

    // Reported back so a student on a laptop with a small window can see that
    // maximising it is all that is needed — the usual cause on a real computer.
    useEffect(() => {
        const read = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        read();
        window.addEventListener('resize', read);
        return () => window.removeEventListener('resize', read);
    }, []);

    const onlyWindowTooSmall =
        size !== null &&
        window.screen.width >= MIN_VIEWPORT_WIDTH &&
        window.screen.height >= MIN_VIEWPORT_HEIGHT;

    return (
        <div className="too-small">
            <div className="too-small__card glass-card">
                <div className="too-small__icon" aria-hidden="true">💻</div>

                {onlyWindowTooSmall ? (
                    <>
                        <h1>Make this window a little bigger</h1>
                        <p className="too-small__lede">
                            Your screen is fine — the browser window just needs to be larger. Maximise
                            it and this will clear on its own.
                        </p>
                    </>
                ) : (
                    <>
                        <h1>This device is too small for the exam</h1>
                        <p className="too-small__lede">
                            The Olympiad paper needs a laptop, desktop, or a tablet — a phone screen
                            cannot show the question list and the paper side by side, and we would
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
                    {size && (
                        <div className="tech-req-row">
                            <dt>This window</dt>
                            <dd>
                                {size.w} × {size.h}
                            </dd>
                        </div>
                    )}
                </dl>

                {!onlyWindowTooSmall && (
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
                    Everything else — your dashboard, results, certificates and your slot — works
                    fine on this device. It is only the exam itself that needs a bigger screen.
                </p>

                <Link href="/dashboard" className="btn btn-primary">
                    Back to my dashboard
                </Link>
            </div>
        </div>
    );
}
