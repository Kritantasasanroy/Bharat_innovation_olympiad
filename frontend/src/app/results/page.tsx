'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';

export default function ResultsPage() {
    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ padding: 'var(--space-8) var(--space-6)' }}>
                <h1>Your Results</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>
                    View detailed performance analytics for your completed exams.
                </p>

                <div className="results-list">
                    {[
                        { id: '1', title: 'Practice Test: Logic & Reasoning', score: 85, total: 100, rank: 42, totalStudents: 1200, date: 'Feb 28, 2026', percentage: 85 },
                        { id: '2', title: 'Trial Round: Innovation Aptitude', score: 72, total: 100, rank: 108, totalStudents: 1200, date: 'Feb 20, 2026', percentage: 72 },
                        { id: '3', title: 'Mock Test: STEM Awareness', score: 91, total: 100, rank: 15, totalStudents: 950, date: 'Feb 10, 2026', percentage: 91 },
                    ].map((result) => (
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
                                                <stop offset="0%" stopColor="var(--primary-500)" />
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
                                    <div className="result-stat">
                                        <span className="result-stat-value">#{result.rank}</span>
                                        <span className="result-stat-label">Rank</span>
                                    </div>
                                    <div className="result-stat">
                                        <span className="result-stat-value">Top {Math.round((result.rank / result.totalStudents) * 100)}%</span>
                                        <span className="result-stat-label">Percentile</span>
                                    </div>
                                    <div className="result-stat">
                                        <span className="result-stat-value">{result.totalStudents}</span>
                                        <span className="result-stat-label">Participants</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

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
