'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * The last line of defence against a white screen.
 *
 * Next renders this in place of any page whose render throws. Without it, an
 * unexpected shape from one API call — a null where an object was assumed, an
 * array that came back as an error object — blanks the entire page with no
 * explanation and no way forward. For a student mid-flow, that is indistinguishable
 * from the site being down.
 *
 * `reset()` re-renders the segment, which genuinely recovers from the common case:
 * a transient failed fetch during render.
 *
 * Deliberately plain: this must not itself depend on data, context or anything
 * that could be the thing that broke.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Kept so the digest is recoverable from a student's console during
        // support, and so it reaches any error reporter wired up later.
        console.error('Page error:', error);
    }, [error]);

    return (
        <div className="error-page">
            <div className="error-page__card">
                <div className="error-page__icon" aria-hidden="true">⚠️</div>
                <h1>Something went wrong on this page</h1>
                <p>
                    This is our fault, not yours. Nothing you have submitted is lost — exam answers,
                    payments and registrations are all saved on our servers as they happen.
                </p>

                <div className="error-page__actions">
                    <button type="button" className="btn btn-primary" onClick={reset}>
                        ↻ Try again
                    </button>
                    <Link href="/dashboard" className="btn btn-secondary">
                        Go to my dashboard
                    </Link>
                </div>

                <p className="error-page__support">
                    If it keeps happening, <Link href="/support">tell us</Link> and quote this code:
                    <code>{error.digest ?? 'no-digest'}</code>
                </p>
            </div>
        </div>
    );
}
