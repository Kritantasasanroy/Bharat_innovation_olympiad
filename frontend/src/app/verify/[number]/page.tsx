'use client';

import ThemeToggle from '@/components/ThemeToggle';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * PUBLIC certificate verification (spec Student §28).
 *
 * Deliberately does NOT use the authenticated `api` client — anyone holding a
 * certificate number must be able to check it without an Innovation Olympiad account. An unknown
 * or malformed number and a real-but-revoked one are reported differently, but
 * neither leaks anything the certificate itself does not already print.
 */

type VerifyResult =
    | {
          valid: true;
          certificateNumber: string;
          holderName: string;
          examTitle: string;
          score: number;
          maxScore: number;
          percentile: number | null;
          rank: number | null;
          issuedAt: string;
      }
    | { valid: false; reason: 'NOT_FOUND' }
    | { valid: false; reason: 'REVOKED'; certificateNumber: string; revokedAt: string; revokeReason: string | null };

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function VerifyCertificatePage() {
    const params = useParams<{ number: string }>();
    const certificateNumber = decodeURIComponent(String(params?.number ?? ''));

    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!certificateNumber) return;
        let cancelled = false;

        fetch(`${API_URL}/api/certificates/verify/${encodeURIComponent(certificateNumber)}`)
            .then((res) => res.json())
            .then((data: VerifyResult) => {
                if (!cancelled) setResult(data);
            })
            .catch(() => {
                if (!cancelled) setError('Could not reach the verification service. Please try again.');
            });

        return () => {
            cancelled = true;
        };
    }, [certificateNumber]);

    return (
        <div style={{ minHeight: '100vh', padding: 'var(--space-8) var(--space-6)' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-8)' }}>
                    <Link href="/" className="brand-text" style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                        {APP_NAME}
                    </Link>
                    <ThemeToggle />
                </div>

                <div className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
                    <h1>Certificate verification</h1>
                    <p className="text-muted">
                        Checking certificate <strong className="text-mono">{certificateNumber}</strong>
                    </p>
                </div>

                {error && <div className="notice notice--error glass-card" style={{ padding: 'var(--space-4)' }}>{error}</div>}

                {!result && !error && (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                )}

                {result?.valid === true && (
                    <div className="glass-card" style={{ padding: 'var(--space-8)' }}>
                        <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-6)' }}>
                            <span style={{ fontSize: '2rem' }}>✅</span>
                            <div>
                                <h2 style={{ margin: 0 }}>This certificate is genuine</h2>
                                <p className="text-muted" style={{ margin: 0 }}>
                                    Issued by {APP_NAME}
                                </p>
                            </div>
                        </div>

                        <div className="table-responsive">
                        <table className="data-table">
                            <tbody>
                                <tr>
                                    <th>Certificate number</th>
                                    <td className="text-mono">{result.certificateNumber}</td>
                                </tr>
                                <tr>
                                    <th>Awarded to</th>
                                    <td><strong>{result.holderName}</strong></td>
                                </tr>
                                <tr>
                                    <th>Examination</th>
                                    <td>{result.examTitle}</td>
                                </tr>
                                <tr>
                                    <th>Score</th>
                                    <td>
                                        {result.score} / {result.maxScore}
                                    </td>
                                </tr>
                                {result.percentile !== null && (
                                    <tr>
                                        <th>Percentile</th>
                                        <td>{result.percentile}</td>
                                    </tr>
                                )}
                                {result.rank !== null && (
                                    <tr>
                                        <th>Rank</th>
                                        <td>#{result.rank}</td>
                                    </tr>
                                )}
                                <tr>
                                    <th>Issued on</th>
                                    <td>{new Date(result.issuedAt).toLocaleDateString()}</td>
                                </tr>
                            </tbody>
                        </table>
                        </div>
                    </div>
                )}

                {result?.valid === false && result.reason === 'REVOKED' && (
                    <div className="glass-card" style={{ padding: 'var(--space-8)' }}>
                        <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
                            <span style={{ fontSize: '2rem' }}>⚠️</span>
                            <div>
                                <h2 style={{ margin: 0 }}>This certificate has been revoked</h2>
                                <p className="text-muted" style={{ margin: 0 }}>
                                    It was issued by {APP_NAME} but is no longer valid.
                                </p>
                            </div>
                        </div>
                        <p className="text-muted">
                            Revoked on {new Date(result.revokedAt).toLocaleDateString()}
                            {result.revokeReason ? `: ${result.revokeReason}` : ''}
                        </p>
                    </div>
                )}

                {result?.valid === false && result.reason === 'NOT_FOUND' && (
                    <div className="glass-card" style={{ padding: 'var(--space-8)' }}>
                        <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
                            <span style={{ fontSize: '2rem' }}>❌</span>
                            <div>
                                <h2 style={{ margin: 0 }}>No such certificate</h2>
                                <p className="text-muted" style={{ margin: 0 }}>
                                    We have no record of this certificate number.
                                </p>
                            </div>
                        </div>
                        <p className="text-muted">
                            Check the number for typos. Certificate numbers look like{' '}
                            <span className="text-mono">BIO-2026-K3QF7ZX2M9</span>.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
