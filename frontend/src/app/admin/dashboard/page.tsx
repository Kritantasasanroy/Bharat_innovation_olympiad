'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useEffect, useState } from 'react';

export default function AdminDashboard() {
    const [stats, setStats] = useState({ students: '—', exams: '—', questions: '—', uptime: '—' });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const { data } = await api.get('/admin/stats');
                setStats({
                    students: data.students?.toLocaleString() || '—',
                    exams: data.exams?.toString() || '—',
                    questions: data.questions?.toLocaleString() || '—',
                    uptime: data.uptime || '—',
                });
            } catch {
                // API may not exist yet — show placeholder
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

                {/* Stats */}
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

                {/* Quick Actions */}
                <section className="dashboard-section" style={{ marginTop: 'var(--space-8)' }}>
                    <h2>Quick Actions</h2>
                    <div className="grid-3" style={{ marginTop: 'var(--space-5)' }}>
                        <a href="/admin/questions" className="glass-card action-card">
                            <span className="action-icon">📝</span>
                            <h3>Question Bank</h3>
                            <p>Add, edit, and organize questions by topic and difficulty.</p>
                        </a>
                        <a href="/admin/exams" className="glass-card action-card">
                            <span className="action-icon">📋</span>
                            <h3>Create Exam</h3>
                            <p>Build exam blueprints from question pools.</p>
                        </a>
                        <a href="/admin/analytics" className="glass-card action-card">
                            <span className="action-icon">📊</span>
                            <h3>Analytics</h3>
                            <p>View performance reports and proctor alerts.</p>
                        </a>
                    </div>
                </section>

                <style jsx>{`
          .dashboard { padding: var(--space-8) var(--space-6); }
          .dashboard-stats { margin-bottom: var(--space-8); }
          .dashboard-section h2 { margin-bottom: var(--space-4); }
          .action-card {
            padding: var(--space-6); text-align: center; text-decoration: none;
            color: var(--text-primary); cursor: pointer;
          }
          .action-icon { font-size: 2rem; margin-bottom: var(--space-3); display: block; }
          .action-card h3 { margin-bottom: var(--space-2); }
          .action-card p { font-size: 0.85rem; color: var(--text-secondary); }
        `}</style>
            </main>
        </AuthGuard>
    );
}
