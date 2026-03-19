'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { CLASS_BANDS } from '@/lib/constants';
import { FormEvent, useEffect, useState } from 'react';

interface Exam {
    id: string;
    title: string;
    description: string | null;
    classBands: number[];
    totalMarks: number;
    durationMinutes: number;
    isPublished: boolean;
    createdAt: string;
    _count: {
        sections: number;
        instances: number;
    };
}

export default function AdminExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        classBands: [] as number[],
        totalMarks: 100,
        durationMinutes: 60,
    });

    const fetchExams = async () => {
        try {
            setLoading(true);
            const { data } = await api.get<Exam[]>('/admin/exams');
            setExams(data);
        } catch (err) {
            console.error('Failed to fetch exams', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExams();
    }, []);

    const handleClassBandToggle = (band: number) => {
        setFormData((prev) => ({
            ...prev,
            classBands: prev.classBands.includes(band)
                ? prev.classBands.filter((b) => b !== band)
                : [...prev.classBands, band].sort((a, b) => a - b),
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (formData.classBands.length === 0) {
            setError('Please select at least one class band.');
            return;
        }

        try {
            setSubmitting(true);
            setError('');
            await api.post('/admin/exams', formData);
            setShowModal(false);
            setFormData({
                title: '',
                description: '',
                classBands: [],
                totalMarks: 100,
                durationMinutes: 60,
            });
            fetchExams();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create exam. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <div>
                        <h1>Exam Management</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                            Create and manage exams, set their duration, and target specific classes.
                        </p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        + Create Exam
                    </button>
                </div>

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                    </div>
                ) : exams.length > 0 ? (
                    <div className="grid-3" style={{ marginTop: 'var(--space-8)' }}>
                        {exams.map((exam) => (
                            <div key={exam.id} className="glass-card exam-card">
                                <h3>{exam.title}</h3>
                                <p className="exam-desc">{exam.description || 'No description provided.'}</p>
                                
                                <div className="exam-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Classes</span>
                                        <span className="meta-value">{exam.classBands.join(', ')}</span>
                                    </div>
                                    <div className="meta-item">
                                        <span className="meta-label">Duration</span>
                                        <span className="meta-value">{exam.durationMinutes} min</span>
                                    </div>
                                    <div className="meta-item">
                                        <span className="meta-label">Marks</span>
                                        <span className="meta-value">{exam.totalMarks}</span>
                                    </div>
                                </div>

                                <div className="exam-footer">
                                    <span className={`badge ${exam.isPublished ? 'badge-primary' : 'badge-secondary'}`}>
                                        {exam.isPublished ? 'Published' : 'Draft'}
                                    </span>
                                    <div className="exam-stats">
                                        <span>{exam._count.sections} Sections</span>
                                        <span>•</span>
                                        <span>{exam._count.instances} Instances</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card empty-state">
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📋</div>
                        <h3>No Exams Created</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            You haven't created any exams yet. Click the button above to get started.
                        </p>
                    </div>
                )}

                {/* Create Exam Modal */}
                {showModal && (
                    <div className="modal-overlay">
                        <div className="modal-content glass-card animate-fade-in">
                            <h2>Create New Exam</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: '0.9rem' }}>
                                Define the basic structure of the exam. You can add sections and questions later.
                            </p>

                            {error && <div className="form-error">{error}</div>}

                            <form onSubmit={handleSubmit} className="exam-form">
                                <div className="form-group">
                                    <label>Exam Title *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        required
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g., Regional Science Olympiad 2026"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        className="form-control"
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Brief description of the exam content..."
                                    />
                                </div>

                                <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                                    <div className="form-group">
                                        <label>Duration (minutes) *</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            required
                                            min="10"
                                            max="300"
                                            value={formData.durationMinutes}
                                            onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Total Marks *</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            required
                                            min="1"
                                            max="1000"
                                            value={formData.totalMarks}
                                            onChange={(e) => setFormData({ ...formData, totalMarks: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Target Classes *</label>
                                    <div className="class-pills">
                                        {CLASS_BANDS.map((band) => (
                                            <button
                                                key={band}
                                                type="button"
                                                className={`class-pill ${formData.classBands.includes(band) ? 'active' : ''}`}
                                                onClick={() => handleClassBandToggle(band)}
                                            >
                                                Class {band}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="modal-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setShowModal(false)}
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Creating...' : 'Create Exam'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <style jsx>{`
                    .page-content { padding: var(--space-8) var(--space-6); }
                    .page-header {
                        display: flex; justify-content: space-between; align-items: flex-start;
                    }
                    .exam-card {
                        padding: var(--space-6);
                        display: flex; flex-direction: column;
                    }
                    .exam-card h3 { margin-bottom: var(--space-2); font-size: 1.15rem; }
                    .exam-desc {
                        font-size: 0.85rem; color: var(--text-secondary);
                        margin-bottom: var(--space-5); flex-grow: 1;
                    }
                    .exam-meta {
                        display: flex; justify-content: space-between;
                        padding: var(--space-3) 0;
                        border-top: 1px solid var(--border-subtle);
                        border-bottom: 1px solid var(--border-subtle);
                        margin-bottom: var(--space-4);
                    }
                    .meta-item { display: flex; flex-direction: column; }
                    .meta-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
                    .meta-value { font-size: 0.9rem; font-weight: 500; margin-top: 2px; }
                    .exam-footer {
                        display: flex; justify-content: space-between; align-items: center;
                    }
                    .exam-stats {
                        display: flex; gap: var(--space-2);
                        font-size: 0.8rem; color: var(--text-muted);
                    }
                    
                    /* Empty State */
                    .empty-state {
                        padding: var(--space-12) var(--space-6);
                        text-align: center; margin-top: var(--space-8);
                    }
                    
                    /* Modal */
                    .modal-overlay {
                        position: fixed; inset: 0;
                        background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
                        display: flex; align-items: center; justify-content: center;
                        z-index: 1000; padding: var(--space-4);
                    }
                    .modal-content {
                        width: 100%; max-width: 500px;
                        padding: var(--space-8);
                    }
                    .exam-form { display: flex; flex-direction: column; gap: var(--space-4); }
                    .form-group { display: flex; flex-direction: column; gap: var(--space-2); }
                    .form-group label { font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); }
                    .form-control {
                        background: var(--bg-input); border: 1px solid var(--border-default);
                        color: var(--text-primary); padding: var(--space-3);
                        border-radius: var(--radius-md); transition: border-color var(--transition-fast);
                    }
                    .form-control:focus { outline: none; border-color: var(--primary-400); }
                    .form-error {
                        background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2);
                        color: var(--danger-400); padding: var(--space-3);
                        border-radius: var(--radius-sm); font-size: 0.85rem;
                        margin-bottom: var(--space-2);
                    }
                    
                    /* Class Pills */
                    .class-pills { display: flex; flex-wrap: wrap; gap: var(--space-2); }
                    .class-pill {
                        background: var(--bg-elevated); border: 1px solid var(--border-default);
                        color: var(--text-secondary); padding: var(--space-2) var(--space-3);
                        border-radius: var(--radius-full); font-size: 0.85rem;
                        cursor: pointer; transition: all var(--transition-fast);
                    }
                    .class-pill:hover { border-color: var(--primary-500); }
                    .class-pill.active {
                        background: rgba(251, 197, 11, 0.15); border-color: var(--primary-500);
                        color: var(--primary-400); font-weight: 500;
                    }
                    
                    .modal-actions {
                        display: flex; justify-content: flex-end; gap: var(--space-4);
                        margin-top: var(--space-6); padding-top: var(--space-4);
                        border-top: 1px solid var(--border-subtle);
                    }
                `}</style>
            </main>
        </AuthGuard>
    );
}
