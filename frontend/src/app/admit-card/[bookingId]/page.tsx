'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { api } from '@/lib/api';
import { APP_NAME } from '@/lib/constants';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface AdmitCard {
    admitCardNumber: string;
    student: { name: string; email: string; classBand: number | null };
    exam: { title: string; durationMinutes: number; totalMarks: number };
    slot: { label: string | null; startsAt: string; endsAt: string };
    requireSeb: boolean;
    instructions: string[];
}

/** Printable admit card for a confirmed booking (spec Student §17). */
export default function AdmitCardPage() {
    const params = useParams<{ bookingId: string }>();
    const [card, setCard] = useState<AdmitCard | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!params?.bookingId) return;
        api.get<AdmitCard>(`/admit-card/${params.bookingId}`)
            .then(({ data }) => setCard(data))
            .catch((err) =>
                setError(err?.response?.data?.message ?? 'Admit card is not available for this booking.'),
            );
    }, [params?.bookingId]);

    return (
        <AuthGuard>
            <div style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: 820, margin: '0 auto' }}>
                {error && <div className="form-error">{error}</div>}

                {!card && !error && (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                )}

                {card && (
                    <>
                        <div className="no-print flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
                            <a href="/dashboard" className="btn btn-secondary btn-sm">
                                ← Dashboard
                            </a>
                            <button className="btn btn-primary" onClick={() => window.print()}>
                                Download / print
                            </button>
                        </div>

                        <div className="glass-card" style={{ padding: 'var(--space-8)' }}>
                            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
                                <div>
                                    <p className="meta-label">{APP_NAME}</p>
                                    <h1 style={{ margin: 0 }}>Admit Card</h1>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className="meta-label">Admit card no.</span>
                                    <strong className="text-mono">{card.admitCardNumber}</strong>
                                </div>
                            </div>

                            <table className="data-table">
                                <tbody>
                                    <tr>
                                        <th>Candidate</th>
                                        <td>
                                            <strong>{card.student.name}</strong>
                                            <div className="join-date">{card.student.email}</div>
                                        </td>
                                    </tr>
                                    {card.student.classBand !== null && (
                                        <tr>
                                            <th>Class</th>
                                            <td>Class {card.student.classBand}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <th>Examination</th>
                                        <td>{card.exam.title}</td>
                                    </tr>
                                    <tr>
                                        <th>Slot</th>
                                        <td>
                                            {card.slot.label ? `${card.slot.label}: ` : ''}
                                            {new Date(card.slot.startsAt).toLocaleString()} to{' '}
                                            {new Date(card.slot.endsAt).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                    <tr>
                                        <th>Duration</th>
                                        <td>
                                            {card.exam.durationMinutes} minutes · {card.exam.totalMarks} marks
                                        </td>
                                    </tr>
                                    {card.requireSeb && (
                                        <tr>
                                            <th>Browser</th>
                                            <td>Safe Exam Browser is required for this exam.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            <h3 style={{ marginTop: 'var(--space-6)' }}>Instructions</h3>
                            <ol className="text-muted" style={{ paddingLeft: '1.2rem', lineHeight: 1.9 }}>
                                {card.instructions.map((instruction) => (
                                    <li key={instruction}>{instruction}</li>
                                ))}
                            </ol>
                        </div>
                    </>
                )}
            </div>

            <style jsx global>{`
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
                        color: #000 !important;
                    }
                }
            `}</style>
        </AuthGuard>
    );
}
