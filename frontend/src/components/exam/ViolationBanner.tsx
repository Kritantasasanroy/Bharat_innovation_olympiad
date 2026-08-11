'use client';

import { violationConsequence, violationCopy, type ViolationKind } from '@/lib/examIntegrity';

/**
 * The titled warning that drops from the top of the paper after a violation.
 *
 * Replaces a bare `⚠️ 2 / 3` counter that named nothing. A student who has just
 * picked one up needs to know which rule caught them and what the system
 * actually saw — the difference between "you cheated" and "your camera lost your
 * face" is the whole difference to a 13-year-old sitting an olympiad.
 *
 * It no longer counts down to anything. Violations do not end a paper, so
 * styling the one before last as a "last chance" was announcing a cliff that
 * does not exist, and the number it showed ("2 of 3") was a promise the system
 * no longer keeps. Past the review threshold it says the true consequence
 * instead: a person will read this.
 *
 * Not auto-dismissed. The one before it disappeared on a timer, which meant a
 * student who was mid-question when it fired never saw it at all and had no way
 * to get it back.
 */
export default function ViolationBanner({
    kind,
    count,
    threshold,
    onDismiss,
}: {
    kind: ViolationKind;
    count: number;
    /** Where review starts. Changes the tone, never ends the exam. */
    threshold: number;
    onDismiss: () => void;
}) {
    const copy = violationCopy(kind);
    const willBeReviewed = count >= threshold;

    return (
        <div
            className={`violation-banner ${willBeReviewed ? 'violation-banner--reviewed' : ''}`}
            role="alert"
            aria-live="assertive"
        >
            <div className="violation-banner__icon" aria-hidden="true">{copy.icon}</div>

            <div className="violation-banner__body">
                <div className="violation-banner__head">
                    <strong className="violation-banner__title">{copy.title}</strong>
                    <span className="violation-banner__count">
                        {count} recorded
                    </span>
                </div>

                <p className="violation-banner__what">{copy.what}</p>
                <p className="violation-banner__fix">
                    <strong>What to do:</strong> {copy.fix}
                </p>
                <p className={`violation-banner__consequence ${willBeReviewed ? 'is-critical' : ''}`}>
                    {violationConsequence(count, threshold)}
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
