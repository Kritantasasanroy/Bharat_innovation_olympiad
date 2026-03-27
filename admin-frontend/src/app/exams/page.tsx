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
    _count: {
        sections: number;
        instances: number;
    };
}

interface ScheduleForm {
    startsAt: string;
    endsAt: string;
}

export default function AdminExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [activeExamAction, setActiveExamAction] = useState('');
    const [scheduleForms, setScheduleForms] = useState<Record<string, ScheduleForm>>({});

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        classBands: [] as number[],
        totalMarks: 100,
        durationMinutes: 60,
    });

    const getDefaultSchedule = (): ScheduleForm => {
        const start = new Date();
        start.setMinutes(start.getMinutes() + 10);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + 60);
        return {
            startsAt: start.toISOString().slice(0, 16),
            endsAt: end.toISOString().slice(0, 16),
        };
    };

    const getApiErrorMessage = (err: unknown, fallback: string) => {
        const responseData =
            typeof err === 'object' &&
            err !== null &&
            'response' in err &&
            typeof (err as { response?: unknown }).response === 'object'
                ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data
                : undefined;
        const message = responseData?.message;
        if (Array.isArray(message)) {
            return message.join(', ');
        }
        return message || fallback;
    };

    const fetchExams = async () => {
        try {
            setLoading(true);
            const { data } = await api.get<Exam[]>('/admin/exams');
            setExams(data);
            setScheduleForms((prev) => {
                const next = { ...prev };
                data.forEach((exam) => {
                    if (!next[exam.id]) {
                        next[exam.id] = getDefaultSchedule();
                    }
                });
                return next;
            });
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
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'Failed to create exam. Please try again.'));
        } finally {
            setSubmitting(false);
        }
    };

    const updateScheduleForm = (examId: string, field: keyof ScheduleForm, value: string) => {
        setScheduleForms((prev) => ({
            ...prev,
            [examId]: {
                ...(prev[examId] || getDefaultSchedule()),
                [field]: value,
            },
        }));
    };

    const scheduleExam = async (examId: string) => {
        const form = scheduleForms[examId] || getDefaultSchedule();
        if (!form.startsAt || !form.endsAt) {
            setActionError('Please provide both schedule start and end time.');
            return;
        }
        if (new Date(form.endsAt) <= new Date(form.startsAt)) {
            setActionError('Schedule end time must be after start time.');
            return;
        }

        try {
            setActionError('');
            setActiveExamAction(`schedule-${examId}`);
            await api.post(`/admin/exams/${examId}/instances`, {
                startsAt: new Date(form.startsAt).toISOString(),
                endsAt: new Date(form.endsAt).toISOString(),
                requireSeb: false,
            });
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to schedule test.'));
        } finally {
            setActiveExamAction('');
        }
    };

    const releaseQuestionPaper = async (examId: string) => {
        try {
            setActionError('');
            setActiveExamAction(`question-${examId}`);
            await api.post(`/admin/exams/${examId}/release-question-paper`);
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to release question paper.'));
        } finally {
            setActiveExamAction('');
        }
    };

    const releaseResults = async (examId: string) => {
        try {
            setActionError('');
            setActiveExamAction(`result-${examId}`);
            await api.post(`/admin/exams/${examId}/release-results`);
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to release results.'));
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
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        + Create Exam
                    </button>
                </div>

                {actionError && (
                    <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>
                        {actionError}
                    </div>
                )}

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
                                        {exam.isPublished ? 'Question Paper Released' : 'Question Paper Pending'}
                                    </span>
                                    <div className="exam-stats">
                                        <span>{exam._count.sections} Sections</span>
                                        <span>•</span>
                                        <span>{exam._count.instances} Instances</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
                                    <div className="grid-2" style={{ gap: 'var(--space-2)' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 'var(--space-1)' }}>Start</label>
                                            <input
                                                type="datetime-local"
                                                className="form-control"
                                                value={scheduleForms[exam.id]?.startsAt || ''}
                                                onChange={(e) => updateScheduleForm(exam.id, 'startsAt', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 'var(--space-1)' }}>End</label>
                                            <input
                                                type="datetime-local"
                                                className="form-control"
                                                value={scheduleForms[exam.id]?.endsAt || ''}
                                                onChange={(e) => updateScheduleForm(exam.id, 'endsAt', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => scheduleExam(exam.id)}
                                        disabled={activeExamAction === `schedule-${exam.id}`}
                                    >
                                        {activeExamAction === `schedule-${exam.id}` ? 'Scheduling...' : 'Schedule Class-wise Test'}
                                    </button>
                                    <a
                                        href={`/questions?examId=${exam.id}`}
                                        className="btn btn-secondary"
                                        style={{ textAlign: 'center', display: 'inline-block' }}
                                    >
                                        Manage Questions
                                    </a>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => releaseQuestionPaper(exam.id)}
                                        disabled={exam.isPublished || activeExamAction === `question-${exam.id}`}
                                    >
                                        {exam.isPublished ? 'Question Paper Released' : activeExamAction === `question-${exam.id}` ? 'Releasing...' : 'Release Question Paper'}
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => releaseResults(exam.id)}
                                        disabled={exam.isResultReleased || activeExamAction === `result-${exam.id}`}
                                    >
                                        {exam.isResultReleased ? 'Results Released' : activeExamAction === `result-${exam.id}` ? 'Releasing...' : 'Release Results'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card empty-state">
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📋</div>
                        <h3>No Exams Created</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            You have not created any exams yet. Click the button above to get started.
                        </p>
                    </div>
                )}

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

                
            </main>
        </AuthGuard>
    );
}
