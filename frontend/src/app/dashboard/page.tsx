'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ExamSummary {
    id: string;
    title: string;
    scheduledAt: string;
    durationMinutes: number;
    status: string;
}

interface ResultSummary {
    id: string;
    examTitle: string;
    score: number;
    totalMarks: number;
    rank?: number;
    completedAt: string;
}

export default function StudentDashboard() {
    const { user } = useAuth();
    const [upcomingExams, setUpcomingExams] = useState<ExamSummary[]>([]);
    const [recentResults, setRecentResults] = useState<ResultSummary[]>([]);
    const [stats, setStats] = useState({ upcoming: 0, completed: 0, avgScore: '—', streak: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch upcoming exams
                const examsRes = await api.get<ExamSummary[]>('/exams/upcoming');
                setUpcomingExams(examsRes.data || []);

                // Fetch recent results
                const resultsRes = await api.get<ResultSummary[]>('/attempts/recent');
                setRecentResults(resultsRes.data || []);

                // Calculate stats from results
                const completed = resultsRes.data?.length || 0;
                const avg = completed > 0
                    ? Math.round(resultsRes.data.reduce((sum: number, r: ResultSummary) => sum + (r.score / r.totalMarks) * 100, 0) / completed)
                    : 0;
                setStats({
                    upcoming: examsRes.data?.length || 0,
                    completed,
                    avgScore: completed > 0 ? `${avg}%` : '—',
                    streak: 0,
                });
            } catch {
                // API endpoints may not exist yet — show empty state
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container dashboard animate-fade-in">
                <div className="dashboard-header">
                    <div>
                        <h1>Welcome back, {user?.firstName}! 👋</h1>
                        <p className="dashboard-subtitle">
                            Class {user?.classBand} • {user?.schoolName || 'Independent Student'}
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid-4 dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-value">{stats.upcoming}</div>
                        <div className="stat-label">Upcoming Exams</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.completed}</div>
                        <div className="stat-label">Completed</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.avgScore}</div>
                        <div className="stat-label">Avg Score</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.streak || '—'}</div>
                        <div className="stat-label">Day Streak</div>
                    </div>
                </div>

                {/* Upcoming Exams */}
                <section className="dashboard-section">
                    <h2>Upcoming Exams</h2>
                    <div className="exam-list">
                        {loading ? (
                            <div className="loading-container" style={{ minHeight: '120px' }}>
                                <div className="spinner" />
                            </div>
                        ) : upcomingExams.length > 0 ? (
                            upcomingExams.map((exam) => (
                                <div key={exam.id} className="glass-card exam-item">
                                    <div className="exam-item-info">
                                        <h3>{exam.title}</h3>
                                        <div className="exam-meta">
                                            <span>📅 {new Date(exam.scheduledAt).toLocaleDateString()}</span>
                                            <span>⏱️ {exam.durationMinutes} min</span>
                                        </div>
                                    </div>
                                    <div className="exam-item-actions">
                                        <span className="badge badge-primary">{exam.status}</span>
                                        <Link href={`/exams/${exam.id}/instructions`} className="btn btn-primary btn-sm">
                                            Start Exam
                                        </Link>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="glass-card exam-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
                                No upcoming exams at the moment. Check back soon!
                            </div>
                        )}
                    </div>
                </section>

                {/* Recent Results */}
                <section className="dashboard-section">
                    <h2>Recent Results</h2>
                    <div className="exam-list">
                        {loading ? (
                            <div className="loading-container" style={{ minHeight: '120px' }}>
                                <div className="spinner" />
                            </div>
                        ) : recentResults.length > 0 ? (
                            recentResults.map((result) => (
                                <div key={result.id} className="glass-card exam-item">
                                    <div className="exam-item-info">
                                        <h3>{result.examTitle}</h3>
                                        <div className="exam-meta">
                                            <span>📅 {new Date(result.completedAt).toLocaleDateString()}</span>
                                            {result.rank && <span>🏅 Rank #{result.rank}</span>}
                                        </div>
                                    </div>
                                    <div className="exam-item-actions">
                                        <div className="score-display">
                                            <span className="score-value">{result.score}</span>
                                            <span className="score-total">/ {result.totalMarks}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="glass-card exam-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
                                No results yet. Complete an exam to see your performance here.
                            </div>
                        )}
                    </div>
                </section>

                
            </main>
        </AuthGuard>
    );
}
