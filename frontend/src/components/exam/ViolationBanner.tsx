'use client';

import { violationConsequence, violationCopy, type ViolationKind } from '@/lib/examIntegrity';

/**
 * The titled warning that drops from the top of the paper after a violation.
 *
 * Replaces a bare `⚠️ 2 / 3` counter that named nothing. A student who has just
 * lost a strike needs to know which rule caught them, what the system actually
 * saw — the difference between "you cheated" and "your camera lost your face" is
 * the whole difference to a 13-year-old sitting an olympiad — and what the next
 * violation costs. All three are on screen at once here.
 *
 * Not auto-dismissed. The one before it disappeared on a timer, which meant a
 * student who was mid-question when it fired never saw it at all and had no way
 * to get it back.
 */
export default function ViolationBanner({
    kind,
    count,
    max,
    onDismiss,
}: {
    kind: ViolationKind;
    count: number;
    max: number;
    onDismiss: () => void;
}) {
    const copy = violationCopy(kind);
    const isFinalWarning = max - count === 1;

    return (
        <div
            className={`violation-banner ${isFinalWarning ? 'violation-banner--last-chance' : ''}`}
            role="alert"
            aria-live="assertive"
        >
            <div className="violation-banner__icon" aria-hidden="true">{copy.icon}</div>

            <div className="violation-banner__body">
                <div className="violation-banner__head">
                    <strong className="violation-banner__title">{copy.title}</strong>
                    <span className="violation-banner__count">
                        Violation {count} of {max}
                    </span>
                </div>

                <p className="violation-banner__what">{copy.what}</p>
                <p className="violation-banner__fix">
                    <strong>What to do:</strong> {copy.fix}
                </p>
                <p className={`violation-banner__consequence ${isFinalWarning ? 'is-critical' : ''}`}>
                    {violationConsequence(count, max)}
                </p>
            </div>

            <button
                type="button"
                className="violation-banner__close"
                onClick={onDismiss}
                aria-label="Dismiss this warning"
            >
                ✕
            </button>
        </div>
    );
}
