'use client';

import { embeddedFormUrl } from '@/lib/constants';
import { useState } from 'react';

/**
 * A full-page beta feedback prompt, shown at the moments worth asking about:
 * straight after registration, and straight after an exam.
 *
 * ## Why the form is embedded rather than linked
 *
 * A link opens a new tab that a popup blocker can swallow and that the student
 * has no reason to come back from. Embedding keeps them inside BIO, so the
 * "Continue" path is still right there when they are done.
 *
 * ## Why "Continue" is never disabled
 *
 * A Google Form in an iframe gives the host page no submit signal — cross-origin
 * frames report nothing. There is no honest way to gate on submission, so this
 * is a prompt rather than a wall: blocking a student from their results behind
 * a check we cannot actually perform would just trap them.
 */
export default function FeedbackInterstitial({
    formUrl,
    title,
    intro,
    continueLabel,
    onContinue,
}: {
    formUrl: string;
    title: string;
    intro: string;
    continueLabel: string;
    onContinue: () => void;
}) {
    const [frameLoaded, setFrameLoaded] = useState(false);
    const [frameFailed, setFrameFailed] = useState(false);

    return (
        <main className="container page-content animate-fade-in" style={{ maxWidth: '820px' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
                <span
                    style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        background: 'rgba(127,127,127,0.14)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    Beta feedback
                </span>
                <h1 style={{ marginTop: 'var(--space-3)' }}>{title}</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>{intro}</p>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                {!frameLoaded && !frameFailed && (
                    <div className="loading-container" style={{ padding: 'var(--space-8)' }}>
                        <div className="spinner" />
                    </div>
                )}

                {frameFailed ? (
                    <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            The form could not be loaded here.
                        </p>
                        <a
                            className="btn btn-primary"
                            href={formUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginTop: 'var(--space-4)' }}
                        >
                            Open the feedback form ↗
                        </a>
                    </div>
                ) : (
                    <iframe
                        src={embeddedFormUrl(formUrl)}
                        title={title}
                        onLoad={() => setFrameLoaded(true)}
                        onError={() => setFrameFailed(true)}
                        style={{
                            display: frameLoaded ? 'block' : 'none',
                            width: '100%',
                            height: '78vh',
                            minHeight: '520px',
                            border: 0,
                        }}
                    />
                )}
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap',
                    marginTop: 'var(--space-5)',
                }}
            >
                <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                >
                    Trouble with the form? Open it in a new tab ↗
                </a>
                <button className="btn btn-primary" onClick={onContinue}>
                    {continueLabel}
                </button>
            </div>
        </main>
    );
}
