'use client';

import { embeddedFormUrl, FEEDBACK_FORMS } from '@/lib/constants';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * A feedback tab docked to the right edge of every signed-in page.
 *
 * "Google form submission button on right" (Beta Testing Requirements). The
 * interstitials only catch two moments — just after registering and just after an
 * exam. A beta tester who hits something odd on the schedule page at 9pm has
 * nowhere to say so, and by the next interstitial they will have forgotten.
 *
 * ## Where it deliberately does not appear
 *
 * The exam player. A student mid-paper must not be offered a panel that covers
 * their questions, and opening an iframe during a proctored exam is a distraction
 * at best. The route check is the guard — not merely hiding it with CSS, which
 * would leave it focusable by keyboard.
 */

/** Path prefixes where the tab must never render. */
const HIDDEN_ON = ['/exams/', '/login', '/register'];

function isHidden(pathname: string | null): boolean {
    if (!pathname) return true;
    // Only the player itself is hidden, not the instructions or schedule pages —
    // those are exactly where a confused tester wants to tell us something.
    if (/^\/exams\/[^/]+\/play/.test(pathname)) return true;
    return HIDDEN_ON.some((p) => p !== '/exams/' && pathname.startsWith(p));
}

export default function FeedbackTab() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Escape closes the panel — it covers content, so it needs a keyboard exit.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (isHidden(pathname)) return null;

    return (
        <>
            <button
                type="button"
                className="feedback-tab"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <span className="feedback-tab__label">Feedback</span>
            </button>

            {open && (
                <>
                    <div
                        className="feedback-panel__scrim"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    <aside
                        className="feedback-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Send beta feedback"
                    >
                        <header className="feedback-panel__head">
                            <div>
                                <span className="feedback-panel__eyebrow">Beta feedback</span>
                                <h2>Tell us what you hit</h2>
                            </div>
                            <button
                                type="button"
                                className="feedback-panel__close"
                                onClick={() => setOpen(false)}
                                aria-label="Close feedback"
                            >
                                ×
                            </button>
                        </header>

                        <iframe
                            src={embeddedFormUrl(FEEDBACK_FORMS.registration)}
                            title="Beta feedback form"
                            className="feedback-panel__frame"
                        />

                        <footer className="feedback-panel__foot">
                            <a
                                href={FEEDBACK_FORMS.registration}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Trouble with the form? Open it in a new tab ↗
                            </a>
                        </footer>
                    </aside>
                </>
            )}
        </>
    );
}
