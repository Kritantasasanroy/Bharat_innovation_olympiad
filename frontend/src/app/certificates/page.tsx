'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Certificates, in two sections: **Olympiad Exams** and **Trainings**.
 *
 * They are genuinely different objects and were previously one undifferentiated
 * grid. An exam certificate is issued by us, carries a score and a rank, and is
 * publicly verifiable by number. A training entry is the student's own record of
 * a session they attended — no score, no rank, and nothing to verify.
 *
 * Mixing them would have been actively misleading in one direction: a training
 * row sitting in a list headed "each one carries a unique number that anyone can
 * verify" reads as an accredited award. Splitting them lets each section say
 * what its own items actually are.
 */

interface Certificate {
    id: string;
    certificateNumber: string;
    score: number;
    maxScore: number;
    percentile: number | null;
    rank: number | null;
    issuedAt: string;
    revokedAt: string | null;
    examInstance: { exam: { title: string } };
}

interface TrainingModule {
    key: string;
    label: string;
    attended: boolean;
    attendedAt: string | null;
}

export default function CertificatesPage() {
    const [certificates, setCertificates] = useState<Certificate[] | null>(null);
    const [training, setTraining] = useState<TrainingModule[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<Certificate[]>('/certificates/me')
            .then(({ data }) => setCertificates(data))
            .catch(() => setError('Could not load your certificates.'));

        // Training is a separate, non-blocking read: a failure here must not
        // hide the exam certificates, which are the more important half.
        api.get('/training/me')
            .then(({ data }) => setTraining(data.modules ?? []))
            .catch(() => setTraining([]));
    }, []);

    const attended = training?.filter((m) => m.attended) ?? [];

    return (
        <AuthGuard>
            <Navbar />
            <div className="page-content" style={{ padding: 'var(--space-8) var(--space-6)' }}>
                <div className="page-header">
                    <h1>Your certificates</h1>
                    <p className="text-muted">
                        Everything you have earned and taken part in this season, in one place.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}

                {/* ── Olympiad Exams ─────────────────────────────────────── */}
                <section className="cert-section">
                    <div className="cert-section__head">
                        <h2>Olympiad Exams</h2>
                        <p className="text-muted">
                            Issued once results for an exam are released. Each one carries a unique
                            number that anyone can verify publicly.
                        </p>
                    </div>

                    {!certificates && !error && (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    )}

                    {certificates && certificates.length === 0 && (
                        <div className="glass-card empty-state">
                            <h3>No exam certificates yet</h3>
                            <p className="text-muted">
                                Once you complete an exam and its results are released, your
                                certificate will appear here.
                            </p>
                        </div>
                    )}

                    <div className="grid-2">
                        {certificates?.map((certificate) => (
                            <div key={certificate.id} className="glass-card" style={{ padding: 'var(--space-6)' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)' }}>
                                    <h3 style={{ margin: 0 }}>{certificate.examInstance.exam.title}</h3>
                                    {certificate.revokedAt ? (
                                        <span className="badge badge-danger">Revoked</span>
                                    ) : (
                                        <span className="badge badge-success">Valid</span>
                                    )}
                                </div>

                                <p className="text-mono text-muted" style={{ fontSize: '0.85rem' }}>
                                    {certificate.certificateNumber}
                                </p>

                                <div className="exam-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Score</span>
                                        <span className="meta-value">
                                            {certificate.score} / {certificate.maxScore}
                                        </span>
                                    </div>
                                    {certificate.percentile !== null && (
                                        <div className="meta-item">
                                            <span className="meta-label">Percentile</span>
                                            <span className="meta-value">{certificate.percentile}</span>
                                        </div>
                                    )}
                                    {certificate.rank !== null && (
                                        <div className="meta-item">
                                            <span className="meta-label">Rank</span>
                                            <span className="meta-value">#{certificate.rank}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3" style={{ marginTop: 'var(--space-4)' }}>
                                    <Link href={`/certificates/${certificate.id}`} className="btn btn-primary btn-sm">
                                        View &amp; download
                                    </Link>
                                    <Link
                                        href={`/verify/${certificate.certificateNumber}`}
                                        className="btn btn-secondary btn-sm"
                                    >
                                        Public verify link
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Trainings ──────────────────────────────────────────── */}
                <section className="cert-section">
                    <div className="cert-section__head">
                        <h2>Trainings</h2>
                        <p className="text-muted">
                            The sessions you have marked as attended. This is your own record, so it
                            carries no score and no verification number.
                        </p>
                    </div>

                    {!training && (
                        <div className="loading-container" style={{ minHeight: '120px' }}>
                            <div className="spinner" />
                        </div>
                    )}

                    {training && attended.length === 0 && (
                        <div className="glass-card empty-state">
                            <h3>No training marked yet</h3>
                            <p className="text-muted">
                                Attended a session? Tick it on the{' '}
                                <Link href="/training">Training page</Link> and it will appear here.
                            </p>
                        </div>
                    )}

                    {attended.length > 0 && (
                        <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                            <ul className="cert-training-list">
                                {attended.map((m) => (
                                    <li key={m.key}>
                                        <span className="cert-training-list__tick" aria-hidden="true">✓</span>
                                        <span>
                                            <strong>{m.label}</strong>
                                            {m.attendedAt && (
                                                <small>
                                                    Marked on{' '}
                                                    {new Date(m.attendedAt).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                </small>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href="/training"
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: 'var(--space-4)' }}
                            >
                                Update my training
                            </Link>
                        </div>
                    )}
                </section>
            </div>
        </AuthGuard>
    );
}
