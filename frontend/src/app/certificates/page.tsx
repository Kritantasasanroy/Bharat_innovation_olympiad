'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export default function CertificatesPage() {
    const [certificates, setCertificates] = useState<Certificate[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<Certificate[]>('/certificates/me')
            .then(({ data }) => setCertificates(data))
            .catch(() => setError('Could not load your certificates.'));
    }, []);

    return (
        <AuthGuard>
            <Navbar />
            <div className="page-content" style={{ padding: 'var(--space-8) var(--space-6)' }}>
                <div className="page-header">
                    <h1>Your certificates</h1>
                    <p className="text-muted">
                        Certificates are issued once results for an exam are released. Each one carries a
                        unique number that anyone can verify publicly.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}

                {!certificates && !error && (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                )}

                {certificates && certificates.length === 0 && (
                    <div className="glass-card empty-state">
                        <h3>No certificates yet</h3>
                        <p className="text-muted">
                            Once you complete an exam and its results are released, your certificate will
                            appear here.
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
            </div>
        </AuthGuard>
    );
}
