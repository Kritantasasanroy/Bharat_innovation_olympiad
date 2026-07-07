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
    isResultReleased: boolean;
    createdAt: string;
    _count: { sections: number; instances: number };
}

export default function AdminExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingExamId, setEditingExamId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [activeExamAction, setActiveExamAction] = useState('');

    const blankFormData = {
        title: '',
        description: '',
        classBands: [] as number[],
        totalMarks: 100,
        durationMinutes: 60,
    };
    const [formData, setFormData] = useState(blankFormData);

    const getApiErrorMessage = (err: unknown, fallback: string) => {
        const responseData =
            typeof err === 'object' && err !== null && 'response' in err &&
            typeof (err as { response?: unknown }).response === 'object'
                ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data
                : undefined;
        const message = responseData?.message;
        if (Array.isArray(message)) return message.join(', ');
        return message || fallback;
    };

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

    useEffect(() => { fetchExams(); }, []);

    const handleClassBandToggle = (band: number) => {
        setFormData((prev) => ({
            ...prev,
            classBands: prev.classBands.includes(band)
                ? prev.classBands.filter((b) => b !== band)
                : [...prev.classBands, band].sort((a, b) => a - b),
        }));
    };

    const openCreateModal = () => {
        setEditingExamId(null);
        setFormData(blankFormData);
        setError('');
        setShowModal(true);
    };

    const openEditModal = (exam: Exam) => {
        setEditingExamId(exam.id);
        setFormData({
            title: exam.title,
            description: exam.description || '',
            classBands: [...exam.classBands],
            totalMarks: exam.totalMarks,
            durationMinutes: exam.durationMinutes,
        });
        setError('');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingExamId(null);
        setFormData(blankFormData);
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
            if (editingExamId) {
                await api.put(`/admin/exams/${editingExamId}`, formData);
            } else {
                await api.post('/admin/exams', formData);
            }
            closeModal();
            fetchExams();
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, editingExamId ? 'Failed to update exam.' : 'Failed to create exam.'));
        } finally {
            setSubmitting(false);
        }
    };

    const togglePublish = async (exam: Exam) => {
        try {
            setActionError('');
            setActiveExamAction(`publish-${exam.id}`);
            await api.put(`/admin/exams/${exam.id}`, { isPublished: !exam.isPublished });
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to toggle publish state.'));
        } finally {
            setActiveExamAction('');
        }
    };

    const toggleResults = async (exam: Exam) => {
        try {
            setActionError('');
            setActiveExamAction(`result-${exam.id}`);
            await api.put(`/admin/exams/${exam.id}`, { isResultReleased: !exam.isResultReleased });
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to toggle results.'));
        } finally {
            setActiveExamAction('');
        }
    };

    const deleteExam = async (examId: string) => {
        if (!confirm('Delete this exam? All questions, instances, and attempts will be permanently lost.')) return;
        try {
            setActionError('');
            setActiveExamAction(`delete-${examId}`);
            await api.delete(`/admin/exams/${examId}`);
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to delete exam.'));
        } finally {
            setActiveExamAction('');
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
                    <button className="btn btn-primary" onClick={openCreateModal}>
                        + Create Exam
                    </button>
                </div>

                {actionError && (
                    <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>{actionError}</div>
                )}

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                    </div>
                ) : exams.length > 0 ? (
                    <div className="grid-3" style={{ marginTop: 'var(--space-8)' }}>
                        {exams.map((exam) => (
                            <div key={exam.id} className="glass-card exam-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                {/* Title + description */}
                                <div>
                                    <h3 style={{ marginBottom: 'var(--space-1)' }}>{exam.title}</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                                        {exam.description || 'No description provided.'}
                                    </p>
                                </div>

                                {/* Meta row */}
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

                                {/* Status badges */}
                                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span className={`badge ${exam.isPublished ? 'badge-success' : 'badge-warning'}`}>
                                        {exam.isPublished ? 'Published' : 'Draft'}
                                    </span>
                                    <span className={`badge ${exam.isResultReleased ? 'badge-success' : 'badge-warning'}`}>
                                        {exam.isResultReleased ? 'Results Released' : 'Results Hidden'}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {exam._count.sections} sections · {exam._count.instances} instances
                                    </span>
                                </div>

                                {/* Action row 1: edit + publish */}
                                <div className="grid-2" style={{ gap: 'var(--space-2)' }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(exam)}>
                                        ✎ Edit Details
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => togglePublish(exam)}
                                        disabled={activeExamAction === `publish-${exam.id}`}
                                    >
                                        {activeExamAction === `publish-${exam.id}` ? '...' : (exam.isPublished ? 'Unpublish' : 'Publish')}
                                    </button>
                                </div>

                                {/* Action row 2: results toggle */}
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ width: '100%' }}
                                    onClick={() => toggleResults(exam)}
                                    disabled={activeExamAction === `result-${exam.id}`}
                                >
                                    {activeExamAction === `result-${exam.id}` ? '...' : (exam.isResultReleased ? 'Hide Results' : 'Release Results')}
                                </button>

                                {/* Manage Questions — primary CTA */}
                                <a
                                    href={`/questions?examId=${exam.id}`}
                                    className="btn btn-primary"
                                    style={{ textAlign: 'center', display: 'block', width: '100%', boxSizing: 'border-box' }}
                                >
                                    📚 Manage Questions &amp; Sections
                                </a>

                                {/* Danger zone */}
                                <button
                                    className="btn btn-danger btn-sm"
                                    style={{ width: '100%' }}
                                    onClick={() => deleteExam(exam.id)}
                                    disabled={activeExamAction === `delete-${exam.id}`}
                                >
                                    {activeExamAction === `delete-${exam.id}` ? 'Deleting...' : '🗑 Delete Exam'}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card empty-state">
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📋</div>
                        <h3>No Exams Created</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Click the button above to create your first exam.
                        </p>
                    </div>
                )}

                {/* Create / Edit Modal */}
                {showModal && (
                    <div className="modal-overlay">
                        <div className="modal-content glass-card animate-fade-in">
                            <h2>{editingExamId ? 'Edit Exam Details' : 'Create New Exam'}</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: '0.9rem' }}>
                                {editingExamId
                                    ? 'Update the exam metadata. Total marks changes auto-rescale existing attempts.'
                                    : 'Define the basic structure of the exam. Add sections and questions after creating it.'}
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
                                    <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                                        {submitting
                                            ? (editingExamId ? 'Saving...' : 'Creating...')
                                            : (editingExamId ? 'Save Changes' : 'Create Exam')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
