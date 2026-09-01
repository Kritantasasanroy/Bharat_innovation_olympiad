'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface ConsentStatus {
    version: string;
    accepted: boolean;
    acceptedAt: string | null;
}

/**
 * Consent capture (spec Student §6).
 *
 * All three permissions are mandatory — a proctored exam cannot run without
 * media capture and monitoring — so the backend rejects a partial consent
 * rather than storing it. Consent is versioned and kept permanently.
 */
function ConsentInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') ?? '/dashboard';

    const [status, setStatus] = useState<ConsentStatus | null>(null);
    const [dataProcessing, setDataProcessing] = useState(false);
    const [mediaCapture, setMediaCapture] = useState(false);
    const [proctoring, setProctoring] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<ConsentStatus>('/consent/me')
            .then(({ data }) => setStatus(data))
            .catch(() => setError('Could not load your consent status.'));
    }, []);

    const allChecked = dataProcessing && mediaCapture && proctoring;

    async function accept() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/consent', { dataProcessing, mediaCapture, proctoring });
            router.push(next);
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'Could not record your consent.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="page-content" style={{ padding: 'var(--space-8) var(--space-6)' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
                <div className="page-header">
                    <h1>Consent</h1>
                    <p className="text-muted">
                        Before you sit a proctored exam we need your explicit permission. This is stored
                        permanently and can be shown to you at any time.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}

                {status?.accepted ? (
                    <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                        <div className="flex items-center gap-3">
                            <span style={{ fontSize: '1.6rem' }}>✅</span>
                            <div>
                                <h3 style={{ margin: 0 }}>Consent recorded</h3>
                                <p className="text-muted" style={{ margin: 0 }}>
                                    Version {status.version} · accepted{' '}
                                    {status.acceptedAt ? new Date(status.acceptedAt).toLocaleString() : ''}
                                </p>
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ marginTop: 'var(--space-5)' }} onClick={() => router.push(next)}>
                            Continue
                        </button>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                        <label className="option-item" style={{ marginBottom: 'var(--space-3)' }}>
                            <input
                                type="checkbox"
                                checked={dataProcessing}
                                onChange={(e) => setDataProcessing(e.target.checked)}
                            />
                            <span>
                                <strong>Data processing.</strong> I allow Innovation Olympiad to process my registration and
                                exam data to deliver the olympiad and publish my results.
                            </span>
                        </label>

                        <label className="option-item" style={{ marginBottom: 'var(--space-3)' }}>
                            <input
                                type="checkbox"
                                checked={mediaCapture}
                                onChange={(e) => setMediaCapture(e.target.checked)}
                            />
                            <span>
                                <strong>Media capture.</strong> I allow my webcam to be used during the exam.
                                Face analysis runs in my own browser; only violation events are sent.
                            </span>
                        </label>

                        <label className="option-item" style={{ marginBottom: 'var(--space-5)' }}>
                            <input
                                type="checkbox"
                                checked={proctoring}
                                onChange={(e) => setProctoring(e.target.checked)}
                            />
                            <span>
                                <strong>Exam monitoring.</strong> I understand that tab switches, leaving
                                fullscreen, and similar events are recorded and reviewed for fairness.
                            </span>
                        </label>

                        <button className="btn btn-primary" disabled={!allChecked || busy} onClick={accept}>
                            {busy ? 'Saving…' : 'I agree'}
                        </button>
                        {!allChecked && (
                            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 'var(--space-3)' }}>
                                All three are required to sit a proctored exam.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ConsentPage() {
    return (
        <AuthGuard>
            <Navbar />
            <Suspense fallback={<div className="loading-container"><div className="spinner" /></div>}>
                <ConsentInner />
            </Suspense>
        </AuthGuard>
    );
}
