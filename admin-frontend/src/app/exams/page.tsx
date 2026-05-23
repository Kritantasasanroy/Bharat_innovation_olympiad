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

interface ExamInstance {
    id: string;
    examId: string;
    startsAt: string;
    endsAt: string;
    requireSeb: boolean;
    _count?: { attempts: number };
}

interface InstanceEdit {
    startsAt: string;
    endsAt: string;
    requireSeb: boolean;
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
    const [scheduleForms, setScheduleForms] = useState<Record<string, ScheduleForm>>({});
    const [instancesByExam, setInstancesByExam] = useState<Record<string, ExamInstance[]>>({});
    const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
    const [instanceEditForm, setInstanceEditForm] = useState<InstanceEdit>({ startsAt: '', endsAt: '', requireSeb: false });

    const blankFormData = {
        title: '',
        description: '',
        classBands: [] as number[],
        totalMarks: 100,
        durationMinutes: 60,
    };
    const [formData, setFormData] = useState(blankFormData);

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
            const results = await Promise.allSettled(
                data.map((exam) => api.get<ExamInstance[]>(`/admin/exams/${exam.id}/instances`))
            );
            const next: Record<string, ExamInstance[]> = {};
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') next[data[i].id] = r.value.data;
            });
            setInstancesByExam(next);
        } catch (err) {
            console.error('Failed to fetch exams', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExams();
    }, []);

    const toLocalInputValue = (iso: string) => {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const openInstanceEdit = (inst: ExamInstance) => {
        setEditingInstanceId(inst.id);
        setInstanceEditForm({
            startsAt: toLocalInputValue(inst.startsAt),
            endsAt: toLocalInputValue(inst.endsAt),
            requireSeb: inst.requireSeb,
        });
    };

    const saveInstanceEdit = async (examId: string, instanceId: string) => {
        if (new Date(instanceEditForm.endsAt) <= new Date(instanceEditForm.startsAt)) {
            setActionError('Instance end time must be after start time.');
            return;
        }
        try {
            setActionError('');
            setActiveExamAction(`inst-save-${instanceId}`);
            await api.put(`/admin/instances/${instanceId}`, {
                startsAt: new Date(instanceEditForm.startsAt).toISOString(),
                endsAt: new Date(instanceEditForm.endsAt).toISOString(),
                requireSeb: instanceEditForm.requireSeb,
            });
            const { data } = await api.get<ExamInstance[]>(`/admin/exams/${examId}/instances`);
            setInstancesByExam((prev) => ({ ...prev, [examId]: data }));
            setEditingInstanceId(null);
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to update instance.'));
        } finally {
            setActiveExamAction('');
        }
    };

    const deleteInstance = async (examId: string, instanceId: string) => {
        if (!confirm('Delete this scheduled instance? All attempts on it will be deleted too.')) return;
        try {
            setActionError('');
            setActiveExamAction(`inst-del-${instanceId}`);
            await api.delete(`/admin/instances/${instanceId}`);
            const { data } = await api.get<ExamInstance[]>(`/admin/exams/${examId}/instances`);
            setInstancesByExam((prev) => ({ ...prev, [examId]: data }));
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to delete instance.'));
        } finally {
            setActiveExamAction('');
        }
    };

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
            setError(getApiErrorMessage(err, editingExamId ? 'Failed to update exam.' : 'Failed to create exam. Please try again.'));
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
            setActionError(getApiErrorMessage(err, 'Failed to toggle result release.'));
        } finally {
            setActiveExamAction('');
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
            const { data } = await api.get<ExamInstance[]>(`/admin/exams/${examId}/instances`);
            setInstancesByExam((prev) => ({ ...prev, [examId]: data }));
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to schedule test.'));
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

    const deleteExam = async (examId: string) => {
        if (!confirm('Are you sure you want to delete this exam? All data including questions, instances, and attempts will be permanently lost.')) return;
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
                                    <span className={`badge ${exam.isPublished ? 'badge-success' : 'badge-warning'}`}>
                                        {exam.isPublished ? 'Published' : 'Draft'}
                                    </span>
                                    <span className={`badge ${exam.isResultReleased ? 'badge-success' : 'badge-warning'}`}>
                                        {exam.isResultReleased ? 'Results Released' : 'Results Hidden'}
                                    </span>
                                    <div className="exam-stats">
                                        <span>{exam._count.sections} Sections</span>
                                        <span>•</span>
                                        <span>{exam._count.instances} Instances</span>
                                    </div>
                                </div>

                                <div className="grid-2" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
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
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ marginTop: 'var(--space-2)', width: '100%' }}
                                    onClick={() => toggleResults(exam)}
                                    disabled={activeExamAction === `result-${exam.id}`}
                                >
                                    {activeExamAction === `result-${exam.id}` ? '...' : (exam.isResultReleased ? 'Hide Results' : 'Release Results')}
                                </button>

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

                                    {(instancesByExam[exam.id]?.length || 0) > 0 && (
                                        <div style={{ display: 'grid', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                Scheduled Instances
                                            </div>
                                            {instancesByExam[exam.id].map((inst) => (
                                                <div key={inst.id} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-2)' }}>
                                                    {editingInstanceId === inst.id ? (
                                                        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                                                            <div className="grid-2" style={{ gap: 'var(--space-2)' }}>
                                                                <input
                                                                    type="datetime-local"
                                                                    className="form-control"
                                                                    value={instanceEditForm.startsAt}
                                                                    onChange={(e) => setInstanceEditForm((p) => ({ ...p, startsAt: e.target.value }))}
                                                                />
                                                                <input
                                                                    type="datetime-local"
                                                                    className="form-control"
                                                                    value={instanceEditForm.endsAt}
                                                                    onChange={(e) => setInstanceEditForm((p) => ({ ...p, endsAt: e.target.value }))}
                                                                />
                                                            </div>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={instanceEditForm.requireSeb}
                                                                    onChange={(e) => setInstanceEditForm((p) => ({ ...p, requireSeb: e.target.checked }))}
                                                                />
                                                                Require Safe Exam Browser
                                                            </label>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    onClick={() => saveInstanceEdit(exam.id, inst.id)}
                                                                    disabled={activeExamAction === `inst-save-${inst.id}`}
                                                                >
                                                                    {activeExamAction === `inst-save-${inst.id}` ? 'Saving…' : 'Save'}
                                                                </button>
                                                                <button className="btn btn-sm btn-secondary" onClick={() => setEditingInstanceId(null)}>
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            <div style={{ fontSize: '0.8rem' }}>
                                                                <div>{new Date(inst.startsAt).toLocaleString()} → {new Date(inst.endsAt).toLocaleString()}</div>
                                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                                                    {inst._count?.attempts || 0} attempts {inst.requireSeb ? '• SEB required' : ''}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                                <button className="btn btn-sm btn-secondary" onClick={() => openInstanceEdit(inst)}>
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-danger"
                                                                    onClick={() => deleteInstance(exam.id, inst.id)}
                                                                    disabled={activeExamAction === `inst-del-${inst.id}`}
                                                                >
                                                                    {activeExamAction === `inst-del-${inst.id}` ? '…' : 'Delete'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <a
                                        href={`/questions?examId=${exam.id}`}
                                        className="btn btn-secondary"
                                        style={{ textAlign: 'center', display: 'inline-block' }}
                                    >
                                        Manage Questions
                                    </a>
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => deleteExam(exam.id)}
                                        disabled={activeExamAction === `delete-${exam.id}`}
                                    >
                                        {activeExamAction === `delete-${exam.id}` ? 'Deleting...' : '🗑 Delete Exam'}
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
                            <h2>{editingExamId ? 'Edit Exam Details' : 'Create New Exam'}</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: '0.9rem' }}>
                                {editingExamId
                                    ? 'Update the exam metadata. Total marks changes auto-rescale existing attempts.'
                                    : 'Define the basic structure of the exam. You can add sections and questions later.'}
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
                                        onClick={closeModal}
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={submitting}
                                    >
                                        {submitting ? (editingExamId ? 'Saving...' : 'Creating...') : (editingExamId ? 'Save Changes' : 'Create Exam')}
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
