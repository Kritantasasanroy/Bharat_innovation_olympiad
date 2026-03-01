'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useEffect, useState } from 'react';

interface ExamResult {
    id: string;
    title: string;
    score: number;
    total: number;
    rank?: number;
    totalStudents?: number;
    date: string;
    percentage: number;
}

export default function ResultsPage() {
    const [results, setResults] = useState<ExamResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const { data } = await api.get<ExamResult[]>('/attempts/results');
                setResults(data || []);
            } catch {
                // API may not exist yet — show empty state
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, []);

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ padding: 'var(--space-8) var(--space-6)' }}>
                <h1>Your Results</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>
                    View detailed performance analytics for your completed exams.
                </p>

                {loading ? (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                ) : results.length > 0 ? (
                    <div className="results-list">
                        {results.map((result) => (
                            <div key={result.id} className="glass-card result-card">
                                <div className="result-header">
                                    <h3>{result.title}</h3>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📅 {result.date}</span>
                                </div>

                                <div className="result-body">
                                    <div className="result-score-ring">
                                        <svg viewBox="0 0 100 100" className="ring-svg">
                                            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-elevated)" strokeWidth="8" />
                                            <circle
                                                cx="50" cy="50" r="42" fill="none"
                                                stroke="url(#gradient)" strokeWidth="8"
                                                strokeLinecap="round"
                                                strokeDasharray={`${result.percentage * 2.64} ${264 - result.percentage * 2.64}`}
                                                strokeDashoffset="66"
                                            />
                                            <defs>
                                                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="var(--primary-400)" />
                                                    <stop offset="100%" stopColor="var(--accent-500)" />
                                                </linearGradient>
                                            </defs>
                                            <text x="50" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="800">
                                                {result.percentage}%
                                            </text>
                                            <text x="50" y="64" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
                                                {result.score}/{result.total}
                                            </text>
                                        </svg>
                                    </div>

                                    <div className="result-stats">
                                        {result.rank && (
                                            <div className="result-stat">
                                                <span className="result-stat-value">#{result.rank}</span>
                                                <span className="result-stat-label">Rank</span>
                                            </div>
                                        )}
                                        {result.rank && result.totalStudents && (
                                            <div className="result-stat">
                                                <span className="result-stat-value">Top {Math.round((result.rank / result.totalStudents) * 100)}%</span>
                                                <span className="result-stat-label">Percentile</span>
                                            </div>
                                        )}
                                        {result.totalStudents && (
                                            <div className="result-stat">
                                                <span className="result-stat-value">{result.totalStudents}</span>
                                                <span className="result-stat-label">Participants</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📋</div>
                        <h3 style={{ marginBottom: 'var(--space-2)' }}>No Results Yet</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Complete an exam to see your detailed performance analytics here.
                        </p>
                    </div>
                )}

                <style jsx>{`
          .results-list { display: flex; flex-direction: column; gap: var(--space-6); }
          .result-card { padding: var(--space-6) var(--space-8); }
          .result-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: var(--space-6);
          }
          .result-body { display: flex; align-items: center; gap: var(--space-10); }
          .result-score-ring { width: 120px; height: 120px; flex-shrink: 0; }
          .ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
          .ring-svg text { transform: rotate(90deg); transform-origin: 50% 50%; }
          .result-stats { display: flex; gap: var(--space-8); }
          .result-stat { display: flex; flex-direction: column; }
          .result-stat-value {
            font-size: 1.3rem; font-weight: 800;
            background: var(--gradient-brand);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .result-stat-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
        `}</style>
            </main>
        </AuthGuard>
    );
}
