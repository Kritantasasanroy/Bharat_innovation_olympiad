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
    isCompleted?: boolean;
    _count?: { sections: number };
    instances?: {
        attempts: { status: string }[];
    }[];
}

export default function StudentExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchExams = async () => {
            try {
                // The backend automatically filters by the student's classBand
                const { data } = await api.get<Exam[]>(`/exams?t=${Date.now()}`);
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
                        {exams.map((exam) => {
                            const isCompleted = exam.isCompleted || false;

                            return (
                                <div key={exam.id} className="glass-card exam-card" style={isCompleted ? { filter: 'grayscale(1)', opacity: 0.7 } : {}}>
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
                                            className={`btn ${isCompleted ? 'btn-secondary' : 'btn-primary'}`}
                                            style={{ width: '100%', cursor: isCompleted ? 'not-allowed' : 'pointer' }}
                                            disabled={isCompleted}
                                            onClick={() => !isCompleted && router.push(`/exams/${exam.id}/instructions`)}
                                        >
                                            {isCompleted ? '✓ Completed' : 'Start Exam'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
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

            </main>
        </AuthGuard>
    );
}
