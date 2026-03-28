'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface UpcomingExam {
    id: string;
    title: string;
    durationMinutes: number;
    isCompleted?: boolean;
    instances?: {
        startsAt: string;
        attempts: { status: string }[];
    }[];
}

interface ResultSummary {
    id: string;
    examTitle: string;
    score: number;
    totalMarks: number;
    rank?: number;
    completedAt: string;
    isReleased?: boolean;
}

export default function StudentDashboard() {
    const { user } = useAuth();
    const [upcomingExams, setUpcomingExams] = useState<UpcomingExam[]>([]);
    const [recentResults, setRecentResults] = useState<ResultSummary[]>([]);
    const [stats, setStats] = useState({ upcoming: 0, completed: 0, avgScore: '—' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch upcoming exams
                const examsRes = await api.get<UpcomingExam[]>('/exams/upcoming');
                setUpcomingExams(examsRes.data || []);

                // Fetch recent results
                const resultsRes = await api.get<ResultSummary[]>('/attempts/recent');
                setRecentResults(resultsRes.data || []);

                // Calculate stats from results
                const releasedData = resultsRes.data || [];
                const completed = releasedData.length;
                const avg = completed > 0
                    ? Math.round(releasedData.reduce((sum: number, r: ResultSummary) => sum + (r.score! / (r.totalMarks || 1)) * 100, 0) / completed)
                    : 0;
                setStats({
                    upcoming: examsRes.data?.length || 0,
                    completed,
                    avgScore: completed > 0 ? `${avg}%` : '—'
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
                <div className="grid-3 dashboard-stats">
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
                            upcomingExams.map((exam) => {
                                const nextInstance = exam.instances?.[0];
                                const isCompleted = exam.isCompleted || false;
                                
                                return (
                                    <div key={exam.id} className="glass-card exam-item" style={isCompleted ? { filter: 'grayscale(1)', opacity: 0.7 } : {}}>
                                        <div className="exam-item-info">
                                            <h3>{exam.title}</h3>
                                            <div className="exam-meta">
                                                <span>📅 {nextInstance?.startsAt ? new Date(nextInstance.startsAt).toLocaleDateString() : 'TBD'}</span>
                                                <span>⏱️ {exam.durationMinutes} min</span>
                                            </div>
                                        </div>
                                        <div className="exam-item-actions">
                                            {isCompleted ? (
                                                <button className="btn btn-secondary btn-sm" disabled style={{ cursor: 'not-allowed' }}>
                                                    ✓ Completed
                                                </button>
                                            ) : (
                                                <Link href={`/exams/${exam.id}/instructions`} className="btn btn-primary btn-sm">
                                                    Start Exam
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
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
                                        {result.isReleased ? (
                                            <div className="score-display">
                                                <span className="score-value">{result.score}</span>
                                                <span className="score-total">/ {result.totalMarks}</span>
                                            </div>
                                        ) : (
                                            <span className="badge badge-warning" style={{ backgroundColor: 'rgba(251, 197, 11, 0.1)', color: 'var(--warning-400)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>Pending Result</span>
                                        )}
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
