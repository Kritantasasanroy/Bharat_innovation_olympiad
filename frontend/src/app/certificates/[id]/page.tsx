'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { api } from '@/lib/api';
import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useParams } from 'next/navigation';
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
    user: { firstName: string; lastName: string; facePhotoUrl: string | null };
    examInstance: { exam: { title: string } };
}

/**
 * Printable certificate (spec Student §27 "Download Certificate").
 *
 * Rendered in the browser and downloaded via print-to-PDF rather than generated
 * server-side: Puppeteer's bundled Chromium does not fit the current hosting
 * tier, and a print stylesheet gives the same artefact with no extra infra.
 * The verification URL is printed on the certificate so a reader can check it.
 */
export default function CertificatePage() {
    const params = useParams<{ id: string }>();
    const [certificate, setCertificate] = useState<Certificate | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!params?.id) return;
        api.get<Certificate>(`/certificates/${params.id}`)
            .then(({ data }) => setCertificate(data))
            .catch(() => setError('Certificate not found.'));
    }, [params?.id]);

    const verifyUrl =
        typeof window !== 'undefined' && certificate
            ? `${window.location.origin}/verify/${certificate.certificateNumber}`
            : '';

    return (
        <AuthGuard>
            <div style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: 900, margin: '0 auto' }}>
                {error && <div className="form-error">{error}</div>}

                {!certificate && !error && (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                )}

                {certificate && (
                    <>
                        <div className="no-print flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
                            <a href="/certificates" className="btn btn-secondary btn-sm">
                                ← All certificates
                            </a>
                            <button className="btn btn-primary" onClick={() => window.print()}>
                                Download / print
                            </button>
                        </div>

                        {certificate.revokedAt && (
                            <div className="form-error no-print">
                                This certificate has been revoked and is no longer valid.
                            </div>
                        )}

                        <div className="certificate-sheet">
                            <div className="certificate-border">
                                <p className="certificate-eyebrow">{COMPANY_NAME} presents</p>
                                <h1 className="certificate-title">{APP_NAME}</h1>
                                <p className="certificate-sub">Certificate of Participation &amp; Merit</p>

                                {certificate.user.facePhotoUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element -- a remote
                                    // Cloudinary URL, not a local asset next/image can optimise
                                    <img
                                        src={certificate.user.facePhotoUrl}
                                        alt=""
                                        className="certificate-photo"
                                    />
                                )}

                                <p className="certificate-awarded">This is to certify that</p>
                                <p className="certificate-name">
                                    {certificate.user.firstName} {certificate.user.lastName}
                                </p>
                                <p className="certificate-awarded">
                                    successfully completed the <strong>{certificate.examInstance.exam.title}</strong>
                                </p>

                                <div className="certificate-stats">
                                    <div>
                                        <span className="meta-label">Score</span>
                                        <strong>
                                            {certificate.score} / {certificate.maxScore}
                                        </strong>
                                    </div>
                                    {certificate.percentile !== null && (
                                        <div>
                                            <span className="meta-label">Percentile</span>
                                            <strong>{certificate.percentile}</strong>
                                        </div>
                                    )}
                                    {certificate.rank !== null && (
                                        <div>
                                            <span className="meta-label">Rank</span>
                                            <strong>#{certificate.rank}</strong>
                                        </div>
                                    )}
                                </div>

                                <div className="certificate-footer">
                                    <div>
                                        <span className="meta-label">Certificate number</span>
                                        <strong className="text-mono">{certificate.certificateNumber}</strong>
                                    </div>
                                    <div>
                                        <span className="meta-label">Issued</span>
                                        <strong>{new Date(certificate.issuedAt).toLocaleDateString()}</strong>
                                    </div>
                                </div>

                                <p className="certificate-verify">Verify at {verifyUrl}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <style jsx global>{`
                .certificate-sheet {
                    background: #ffffff;
                    color: #0a0a0a;
                    padding: 2rem;
                    border-radius: var(--radius-lg);
                }
                .certificate-border {
                    border: 3px solid #ffcb05;
                    outline: 1px solid #7dc832;
                    outline-offset: 6px;
                    padding: 3rem 2.5rem;
                    text-align: center;
                }
                .certificate-eyebrow {
                    text-transform: uppercase;
                    letter-spacing: 0.2em;
                    font-size: 0.7rem;
                    color: #666;
                    margin: 0;
                }
                .certificate-title {
                    font-size: 2rem;
                    margin: 0.25rem 0 0;
                    color: #0a0a0a;
                }
                .certificate-sub {
                    color: #4f9a12;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    font-size: 0.75rem;
                    margin-top: 0.25rem;
                }
                .certificate-photo {
                    width: 88px;
                    height: 88px;
                    object-fit: cover;
                    border-radius: 50%;
                    border: 3px solid #ffcb05;
                    margin: 1rem auto 0;
                    display: block;
                }
                .certificate-awarded {
                    color: #444;
                    margin: 1.5rem 0 0.25rem;
                }
                .certificate-name {
                    font-size: 1.9rem;
                    font-weight: 800;
                    margin: 0.25rem 0 0.75rem;
                    border-bottom: 1px solid #ddd;
                    display: inline-block;
                    padding: 0 2rem 0.4rem;
                }
                .certificate-stats {
                    display: flex;
                    justify-content: center;
                    gap: 3rem;
                    margin: 2rem 0 1.5rem;
                }
                .certificate-stats .meta-label,
                .certificate-footer .meta-label {
                    display: block;
                    font-size: 0.65rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: #888;
                }
                .certificate-footer {
                    display: flex;
                    justify-content: space-between;
                    border-top: 1px solid #eee;
                    padding-top: 1rem;
                    margin-top: 1.5rem;
                    text-align: left;
                }
                .certificate-verify {
                    margin-top: 1rem;
                    font-size: 0.7rem;
                    color: #888;
                    word-break: break-all;
                }
                @media print {
                    .no-print,
                    nav,
                    .navbar {
                        display: none !important;
                    }
                    body::before {
                        display: none !important;
                    }
                    body {
                        background: #fff !important;
                    }
                    .certificate-sheet {
                        padding: 0;
                    }
                }
            `}</style>
        </AuthGuard>
    );
}
