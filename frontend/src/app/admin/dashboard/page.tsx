'use client';

import AuthGuard from '@/components/admin/layout/AuthGuard';
import Navbar from '@/components/admin/layout/Navbar';
import api from '@/lib/api';
import { useEffect, useState } from 'react';

interface ExamSummary {
    _count?: {
        sections?: number;
    };
}

export default function AdminDashboard() {
    const [stats, setStats] = useState({ students: '—', exams: '—', questions: '—', uptime: '—' });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [usersRes, examsRes] = await Promise.all([
                    api.get('/auth/admin/users'),
                    api.get('/admin/exams'),
                ]);
                const students = usersRes.data?.length || 0;
                const exams = examsRes.data?.length || 0;
                const questions =
                    (examsRes.data as ExamSummary[] | undefined)?.reduce(
                        (count: number, exam: ExamSummary) => count + (exam._count?.sections || 0),
                        0,
                    ) || 0;
                setStats({
                    students: students.toLocaleString(),
                    exams: exams.toString(),
                    questions: questions.toLocaleString(),
                    uptime: 'Online',
                });
            } catch {
                setStats({ students: '—', exams: '—', questions: '—', uptime: 'Offline' });
            }
        };
        fetchStats();
    }, []);

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container dashboard animate-fade-in">
                <h1>Admin Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                    Manage exams, question banks, and monitor student performance.
                </p>

                <div className="grid-4 dashboard-stats" style={{ marginTop: 'var(--space-8)' }}>
                    <div className="stat-card">
                        <div className="stat-value">{stats.students}</div>
                        <div className="stat-label">Registered Students</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.exams}</div>
                        <div className="stat-label">Active Exams</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.questions}</div>
                        <div className="stat-label">Questions in Bank</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.uptime}</div>
                        <div className="stat-label">Uptime</div>
                    </div>
                </div>

                <section className="dashboard-section" style={{ marginTop: 'var(--space-8)' }}>
                    <h2>Quick Actions</h2>
                    <div className="grid-3" style={{ marginTop: 'var(--space-5)' }}>
                        <a href="/exams" className="glass-card action-card">
                            <span className="action-icon">📝</span>
                            <h3>Question Release</h3>
                            <p>Schedule class-wise tests and release question papers.</p>
                        </a>
                        <a href="/exams" className="glass-card action-card">
                            <span className="action-icon">📋</span>
                            <h3>Exam Scheduling</h3>
                            <p>Manage test windows by class and configure instances.</p>
                        </a>
                        <a href="/analytics" className="glass-card action-card">
                            <span className="action-icon">📊</span>
                            <h3>Result Insights</h3>
                            <p>Review student performance after results are released.</p>
                        </a>
                    </div>
                </section>

                
            </main>
        </AuthGuard>
    );
}
