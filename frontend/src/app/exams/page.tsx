'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Exam {
    id: string;
    title: string;
    description: string | null;
    totalMarks: number;
    durationMinutes: number;
    _count?: { sections: number };
}

export default function StudentExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchExams = async () => {
            try {
                // The backend automatically filters by the student's classBand
                const { data } = await api.get<Exam[]>('/exams');
                setExams(data);
            } catch (err) {
                console.error('Failed to fetch available exams', err);
            } finally {
                setLoading(false);
            }
        };
        fetchExams();
    }, []);

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header" style={{ marginBottom: 'var(--space-8)' }}>
                    <h1>Available Exams</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        Select an exam below to read instructions and start your attempt.
                    </p>
                </div>

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                    </div>
                ) : exams.length > 0 ? (
                    <div className="grid-3">
                        {exams.map((exam) => (
                            <div key={exam.id} className="glass-card exam-card">
                                <h3>{exam.title}</h3>
                                <p className="exam-desc">{exam.description || 'No description provided.'}</p>
                                
                                <div className="exam-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Duration</span>
                                        <span className="meta-value">{exam.durationMinutes} min</span>
                                    </div>
                                    <div className="meta-item">
                                        <span className="meta-label">Total Marks</span>
                                        <span className="meta-value">{exam.totalMarks}</span>
                                    </div>
                                    <div className="meta-item">
                                        <span className="meta-label">Sections</span>
                                        <span className="meta-value">{exam._count?.sections || 0}</span>
                                    </div>
                                </div>

                                <div className="exam-footer">
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ width: '100%' }}
                                        onClick={() => router.push(`/exams/${exam.id}/instructions`)}
                                    >
                                        Start Exam
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card empty-state">
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📚</div>
                        <h3>No Exams Available</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            There are currently no active exams scheduled for your class band.
                        </p>
                    </div>
                )}

                <style jsx>{`
                    .page-content { padding: var(--space-8) var(--space-6); min-height: calc(100vh - 72px); }
                    .exam-card { padding: var(--space-6); display: flex; flex-direction: column; }
                    .exam-card h3 { margin-bottom: var(--space-2); font-size: 1.15rem; color: var(--primary-400); }
                    .exam-desc { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-6); flex-grow: 1; min-height: 40px; }
                    .exam-meta {
                        display: flex; justify-content: space-between;
                        padding: var(--space-4) 0;
                        border-top: 1px solid var(--border-subtle);
                        border-bottom: 1px solid var(--border-subtle);
                        margin-bottom: var(--space-4);
                    }
                    .meta-item { display: flex; flex-direction: column; align-items: center; }
                    .meta-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
                    .meta-value { font-size: 1rem; font-weight: 500; margin-top: 2px; }
                    .exam-footer { margin-top: auto; }
                    .empty-state {
                        padding: var(--space-12) var(--space-6);
                        text-align: center; margin-top: var(--space-8);
                    }
                `}</style>
            </main>
        </AuthGuard>
    );
}
