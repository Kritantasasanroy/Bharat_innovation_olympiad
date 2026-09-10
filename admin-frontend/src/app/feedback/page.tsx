'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

interface FeedbackRow {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    rollNumber: string | null;
    classBand: number | null;
    schoolName: string | null;
    examId: string;
    examTitle: string;
}

interface Summary {
    total: number;
    average: number | null;
    distribution: Record<string, number>;
}

type Filter = 'all' | 'unhappy' | 'commented';

function Stars({ n }: { n: number }) {
    return (
        <span className="fb-stars" title={`${n} out of 5`} aria-label={`${n} out of 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i <= n ? 'fb-star on' : 'fb-star'}>★</span>
            ))}
        </span>
    );
}

/**
 * Student ratings of the olympiad, collected on the submit screen of every exam.
 *
 * Sorted newest first. The "Needs attention" filter is the one that matters
 * day to day: anything under 3 stars had a written explanation forced on it, so
 * those rows always carry something to act on.
 */
export default function FeedbackPage() {
    const [rows, setRows] = useState<FeedbackRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const qs =
                filter === 'unhappy' ? '?maxRating=2'
                : filter === 'commented' ? '?withComment=true'
                : '';
            const [list, sum] = await Promise.all([
                api.get<FeedbackRow[]>(`/admin/exam-feedback${qs}`),
                api.get<Summary>('/admin/exam-feedback/summary'),
            ]);
            setRows(list.data ?? []);
            setSummary(sum.data ?? null);
        } catch {
            setError('Could not load feedback.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { void load(); }, [load]);

    return (
        <AuthGuard>
            <Navbar />
            <main className="container page-content">
                <div className="page-header">
                    <h1>Feedback</h1>
                    <p className="text-secondary">
                        &ldquo;How much did you like the Innovation Olympiad?&rdquo; — asked on the submit
                        screen of every exam, before the student sees any score. Anything under 3 stars
                        must come with a written reason.
                    </p>
                </div>

                {summary && (
                    <div className="fb-summary glass-card">
                        <div className="fb-summary__stat">
                            <div className="fb-summary__value">{summary.average ?? '—'}</div>
                            <div className="fb-summary__label">Average rating</div>
                        </div>
                        <div className="fb-summary__stat">
                            <div className="fb-summary__value">{summary.total}</div>
                            <div className="fb-summary__label">Ratings</div>
                        </div>
                        <div className="fb-summary__dist">
                            {[5, 4, 3, 2, 1].map((n) => {
                                const count = summary.distribution?.[String(n)] ?? 0;
                                const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
                                return (
                                    <div className="fb-dist-row" key={n}>
                                        <span className="fb-dist-row__n">{n}★</span>
                                        <span className="fb-dist-row__bar">
                                            <span style={{ width: `${pct}%` }} />
                                        </span>
                                        <span className="fb-dist-row__c">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="fb-filters">
                    {([
                        ['all', 'All'],
                        ['unhappy', 'Needs attention (1–2★)'],
                        ['commented', 'With a comment'],
                    ] as [Filter, string][]).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilter(key)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {error && <div className="form-error">{error}</div>}

                {loading ? (
                    <div className="loading-container"><div className="spinner" /></div>
                ) : rows.length === 0 ? (
                    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                        <p className="text-secondary" style={{ margin: 0 }}>No feedback yet.</p>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Exam</th>
                                    <th>Rating</th>
                                    <th>Comment</th>
                                    <th>When</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{r.studentName}</div>
                                            <div className="text-secondary" style={{ fontSize: '0.78rem' }}>
                                                {r.rollNumber ? `${r.rollNumber} · ` : ''}{r.studentEmail}
                                            </div>
                                            {r.schoolName && (
                                                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                                    {r.schoolName}{r.classBand ? ` · Class ${r.classBand}` : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td>{r.examTitle}</td>
                                        <td><Stars n={r.rating} /></td>
                                        <td style={{ maxWidth: '420px', whiteSpace: 'pre-wrap' }}>
                                            {r.comment || <span className="text-secondary">—</span>}
                                        </td>
                                        <td className="text-secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                            {new Date(r.createdAt).toLocaleString('en-IN', {
                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
