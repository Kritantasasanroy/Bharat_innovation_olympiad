'use client';

import { embeddedFormUrl } from '@/lib/constants';
import { useState, useEffect } from 'react';

/**
 * A full-page beta feedback prompt, shown at key moments (after registration, after exam).
 *
 * Gated: The "Continue" / "Go to dashboard" button is hidden until the user submits
 * the Google Form (detected via iframe navigation reload or new-tab submission fallback).
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
    const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem(`submitted_feedback_${formUrl}`);
            if (saved === 'true') {
                setHasSubmitted(true);
            }
        }
    }, [formUrl]);

    const handleFrameLoad = () => {
        if (!frameLoaded) {
            setFrameLoaded(true);
        } else {
            // Second load event on iframe indicates Google Form submission redirect
            setHasSubmitted(true);
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(`submitted_feedback_${formUrl}`, 'true');
            }
        }
    };

    const handleManualSubmitConfirm = () => {
        setHasSubmitted(true);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(`submitted_feedback_${formUrl}`, 'true');
        }
    };

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
                            onClick={handleManualSubmitConfirm}
                        >
                            Open feedback form in a new tab ↗
                        </a>
                    </div>
                ) : (
                    <iframe
                        src={embeddedFormUrl(formUrl)}
                        title={title}
                        onLoad={handleFrameLoad}
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

            <div className="feedback-actions" style={{ flexDirection: 'column', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' }}>
                {!hasSubmitted ? (
                    <div style={{ textAlign: 'center', width: '100%' }}>
                        <div
                            style={{
                                padding: '0.85rem 1.25rem',
                                borderRadius: '10px',
                                background: 'rgba(234, 179, 8, 0.12)',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                marginBottom: '0.75rem',
                            }}
                        >
                            📋 Please fill and submit the feedback form above to continue.
                        </div>
                        <a
                            href={formUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="feedback-actions__link"
                            onClick={handleManualSubmitConfirm}
                            style={{ fontSize: '0.85rem' }}
                        >
                            Trouble with the form? Open in new tab (will unlock after opening) ↗
                        </a>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', width: '100%' }}>
                        <div
                            style={{
                                padding: '0.85rem 1.25rem',
                                borderRadius: '10px',
                                background: 'rgba(34, 197, 94, 0.12)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                color: '#16a34a',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                marginBottom: '0.75rem',
                            }}
                        >
                            ✅ Feedback submitted! Thank you for your response.
                        </div>
                        <button className="btn btn-primary btn-lg" onClick={onContinue} style={{ width: '100%', maxWidth: '320px' }}>
                            {continueLabel}
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}

