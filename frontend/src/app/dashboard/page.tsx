'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { useAuth } from '@/hooks/useAuth';

export default function StudentDashboard() {
    const { user } = useAuth();

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container dashboard animate-fade-in">
                <div className="dashboard-header">
                    <div>
                        <h1>Welcome back, {user?.firstName}! 👋</h1>
                        <p className="dashboard-subtitle">
                            Class {user?.classBand} • {user?.schoolName || 'Your School'}
                        </p>
                    </div>
                    <div className="xp-display">
                        <span className="xp-value">250 XP</span>
                        <span className="xp-label">Total Earned</span>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid-4 dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-value">3</div>
                        <div className="stat-label">Upcoming Exams</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">5</div>
                        <div className="stat-label">Completed</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">82%</div>
                        <div className="stat-label">Avg Score</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">🔥 4</div>
                        <div className="stat-label">Day Streak</div>
                    </div>
                </div>

                {/* Upcoming Exams */}
                <section className="dashboard-section">
                    <h2>Upcoming Exams</h2>
                    <div className="exam-list">
                        {[
                            { id: '1', title: 'Innovation Challenge: Round 1', date: 'Mar 15, 2026', time: '10:00 AM', duration: '90 min', status: 'scheduled' },
                            { id: '2', title: 'STEM Aptitude Test', date: 'Mar 22, 2026', time: '2:00 PM', duration: '60 min', status: 'scheduled' },
                            { id: '3', title: 'Creative Thinking Assessment', date: 'Apr 5, 2026', time: '11:00 AM', duration: '75 min', status: 'scheduled' },
                        ].map((exam) => (
                            <div key={exam.id} className="glass-card exam-item">
                                <div className="exam-item-info">
                                    <h3>{exam.title}</h3>
                                    <div className="exam-meta">
                                        <span>📅 {exam.date}</span>
                                        <span>🕐 {exam.time}</span>
                                        <span>⏱️ {exam.duration}</span>
                                    </div>
                                </div>
                                <div className="exam-item-actions">
                                    <span className="badge badge-primary">{exam.status}</span>
                                    <a href={`/exams/${exam.id}/instructions`} className="btn btn-primary btn-sm">
                                        Start Exam
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Recent Results */}
                <section className="dashboard-section">
                    <h2>Recent Results</h2>
                    <div className="exam-list">
                        {[
                            { id: '10', title: 'Practice Test: Logic', score: 85, total: 100, rank: 42, date: 'Feb 28, 2026' },
                            { id: '11', title: 'Trial Round', score: 72, total: 100, rank: 108, date: 'Feb 20, 2026' },
                        ].map((result) => (
                            <div key={result.id} className="glass-card exam-item">
                                <div className="exam-item-info">
                                    <h3>{result.title}</h3>
                                    <div className="exam-meta">
                                        <span>📅 {result.date}</span>
                                        <span>🏅 Rank #{result.rank}</span>
                                    </div>
                                </div>
                                <div className="exam-item-actions">
                                    <div className="score-display">
                                        <span className="score-value">{result.score}</span>
                                        <span className="score-total">/ {result.total}</span>
                                    </div>
                                    <a href={`/results/${result.id}`} className="btn btn-secondary btn-sm">
                                        View Details
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <style jsx>{`
          .dashboard { padding: var(--space-8) var(--space-6); }
          .dashboard-header {
            display: flex; justify-content: space-between; align-items: flex-start;
            margin-bottom: var(--space-8);
          }
          .dashboard-subtitle { color: var(--text-secondary); margin-top: var(--space-2); }
          .xp-display {
            display: flex; flex-direction: column; align-items: center;
            padding: var(--space-4) var(--space-6);
            background: var(--gradient-card); border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
          }
          .xp-value {
            font-size: 1.5rem; font-weight: 800;
            background: var(--gradient-brand);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .xp-label { font-size: 0.75rem; color: var(--text-muted); margin-top: var(--space-1); }
          .dashboard-stats { margin-bottom: var(--space-10); }
          .dashboard-section { margin-bottom: var(--space-10); }
          .dashboard-section h2 { margin-bottom: var(--space-5); }
          .exam-list { display: flex; flex-direction: column; gap: var(--space-4); }
          .exam-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: var(--space-5) var(--space-6);
          }
          .exam-item h3 { font-size: 1rem; margin-bottom: var(--space-2); }
          .exam-meta {
            display: flex; gap: var(--space-4); font-size: 0.85rem; color: var(--text-secondary);
          }
          .exam-item-actions { display: flex; align-items: center; gap: var(--space-4); }
          .score-display { display: flex; align-items: baseline; gap: 2px; }
          .score-value {
            font-size: 1.5rem; font-weight: 800;
            background: var(--gradient-brand);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .score-total { font-size: 0.9rem; color: var(--text-muted); }
        `}</style>
            </main>
        </AuthGuard>
    );
}
