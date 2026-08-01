'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { CLASS_BANDS } from '@/lib/constants';
import { FormEvent, useEffect, useState } from 'react';

interface ExamInstance {
    id: string;
    startsAt: string;
    endsAt: string;
}

interface Exam {
    id: string;
    title: string;
    description: string | null;
    classBands: number[];
    totalMarks: number;
    durationMinutes: number;
    isPublished: boolean;
    isResultReleased: boolean;
    /** Retired from the catalogue. Hidden by default; never deleted. */
    isArchived: boolean;
    /** The rehearsal paper students sit before a real exam. */
    isTrial: boolean;
    /** Whether students must complete the trial before this exam will start. */
    requiresTrial: boolean;
    /** False lets students sit it any time in its window, with no slot booking. */
    requiresSlot: boolean;
    createdAt: string;
    instances: ExamInstance[];
    /** Questions actually attached to this exam's sections. */
    questionCount: number;
    /** The server's decision, mirrored here so the button can explain itself. */
    canPublish: boolean;
    publishBlockedReason: string | null;
    canReleaseResults: boolean;
    releaseBlockedReason: string | null;
    hasEnded: boolean;
    _count: { sections: number; instances: number };
}

const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const formatWindow = (startsAt: string, endsAt: string) => `${fmt(startsAt)} → ${fmt(endsAt)}`;

/** Where an exam window sits relative to now — the same three states students see. */
function scheduleBadge(instance: ExamInstance): { label: string; cls: string } {
    const now = Date.now();
    if (now < new Date(instance.startsAt).getTime()) {
        return { label: 'Upcoming', cls: 'badge-warning' };
    }
    if (now > new Date(instance.endsAt).getTime()) {
        return { label: 'Ended', cls: 'badge-muted' };
    }
    return { label: 'Live', cls: 'badge-success' };
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
    /** Archived exams are hidden by default — retired, not deleted. */
    const [showArchived, setShowArchived] = useState(false);

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

    const fetchExams = async (withArchived = showArchived) => {
        try {
            setLoading(true);
            const { data } = await api.get<Exam[]>('/admin/exams', {
                params: withArchived ? { includeArchived: 'true' } : undefined,
            });
            setExams(data);
        } catch (err) {
            console.error('Failed to fetch exams', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchExams(showArchived); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Retire an exam without destroying it.
     *
     * Deleting would cascade away every attempt, booking, payment and
     * certificate attached to it, so "scrapping" an exam unpublishes and hides
     * it instead. Fully reversible from the same button.
     */
    const toggleArchive = async (exam: Exam) => {
        const archiving = !exam.isArchived;
        if (archiving && !confirm(
            `Archive "${exam.title}"?\n\n` +
            'It disappears from every student\'s list and from this page by default. ' +
            'Nothing is deleted — results, payments and certificates are untouched, and ' +
            'you can restore it at any time.',
        )) return;

        setActiveExamAction(exam.id);
        try {
            await api.post(`/admin/exams/${exam.id}/${archiving ? 'archive' : 'unarchive'}`);
            await fetchExams(showArchived);
        } catch (err) {
            setActionError(getApiErrorMessage(err, `Failed to ${archiving ? 'archive' : 'restore'} the exam.`));
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

    /**
     * Turns the slot requirement on or off for one exam.
     *
     * Off means students may sit it at any point inside its window without
     * booking a sitting. Slots and existing bookings are left untouched, so
     * turning it back on restores the timetable exactly as it was.
     */
    const toggleSlotRequirement = async (exam: Exam) => {
        const turningOff = exam.requiresSlot !== false;
        if (
            turningOff &&
            !confirm(
                'Let students sit this exam without booking a slot?\n\n' +
                    'It becomes startable at any time inside its exam window, for every eligible ' +
                    'student. Existing slots and bookings are kept and are restored if you turn ' +
                    'this back on.',
            )
        ) {
            return;
        }
        try {
            setActionError('');
            setActiveExamAction(`slot-${exam.id}`);
            await api.put(`/admin/exams/${exam.id}`, { requiresSlot: turningOff ? false : true });
            await fetchExams();
        } catch (err: unknown) {
            setActionError(getApiErrorMessage(err, 'Failed to change the slot requirement.'));
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
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                        <button className="btn btn-secondary" onClick={openCreateModal}>
                            + Quick exam
                        </button>
                        <a href="/exams/new" className="btn btn-primary">
                            + New exam with slots
                        </a>
                    </div>
                </div>

                {/* Archived exams are retired, not deleted, so they need a way
                    back into view — this is the only route to un-archiving one. */}
                <label
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        marginTop: 'var(--space-4)', fontSize: '0.875rem',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                >
                    <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    Show archived exams
                </label>

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
                            <div
                                key={exam.id}
                                className="glass-card exam-card"
                                style={{
                                    display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
                                    // Archived exams stay legible but visibly out of play.
                                    ...(exam.isArchived ? { opacity: 0.62, borderStyle: 'dashed' } : {}),
                                }}
                            >
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
                                    {exam.isArchived && <span className="badge badge-muted">Archived</span>}
                                    {exam.isTrial && (
                                        <span className="badge badge-primary" title="The rehearsal paper students sit before a real exam">
                                            Trial paper
                                        </span>
                                    )}
                                    {!exam.isTrial && exam.requiresTrial && (
                                        <span className="badge badge-muted" title="Students must complete the trial test before this exam will start">
                                            Trial required
                                        </span>
                                    )}
                                    {/* Loud on purpose: an exam anyone can walk into
                                        at any time is a deliberate, temporary state,
                                        and it should be obvious at a glance which
                                        exams are in it. */}
                                    {exam.requiresSlot === false && (
                                        <span
                                            className="badge badge-warning"
                                            title="Students can sit this exam at any time inside its window — no slot booking needed. Slots and bookings are kept."
                                        >
                                            No slot needed
                                        </span>
                                    )}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {exam.questionCount} questions · {exam._count.instances} instances
                                    </span>
                                </div>

                                {/* Schedule — the exam window(s) students are gated by. */}
                                {exam.instances.length > 0 ? (
                                    <div className="schedule-strip">
                                        {exam.instances.map((instance) => (
                                            <div key={instance.id} className="schedule-row">
                                                <span>{formatWindow(instance.startsAt, instance.endsAt)}</span>
                                                <span className={`badge ${scheduleBadge(instance).cls}`}>
                                                    {scheduleBadge(instance).label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="hint hint-warn">
                                        No schedule yet — add a date window before publishing.
                                    </p>
                                )}

                                {/* Action row 1: edit + publish */}
                                <div className="grid-2" style={{ gap: 'var(--space-2)' }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(exam)}>
                                        ✎ Edit Details
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => togglePublish(exam)}
                                        // A draft exam with no paper or no schedule cannot be published —
                                        // the server refuses it, so the button says so rather than failing.
                                        disabled={
                                            activeExamAction === `publish-${exam.id}` ||
                                            (!exam.isPublished && !exam.canPublish)
                                        }
                                        title={
                                            !exam.isPublished && exam.publishBlockedReason
                                                ? exam.publishBlockedReason
                                                : undefined
                                        }
                                    >
                                        {activeExamAction === `publish-${exam.id}`
                                            ? '...'
                                            : exam.isPublished
                                              ? 'Unpublish'
                                              : 'Publish'}
                                    </button>
                                </div>

                                {!exam.isPublished && exam.publishBlockedReason && (
                                    <p className="hint hint-warn">⚠ {exam.publishBlockedReason}</p>
                                )}

                                {/* Action row 2: results toggle */}
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ width: '100%' }}
                                    onClick={() => toggleResults(exam)}
                                    // Results cannot be released for an exam that has not finished.
                                    disabled={
                                        activeExamAction === `result-${exam.id}` ||
                                        (!exam.isResultReleased && !exam.canReleaseResults)
                                    }
                                    title={
                                        !exam.isResultReleased && exam.releaseBlockedReason
                                            ? exam.releaseBlockedReason
                                            : undefined
                                    }
                                >
                                    {activeExamAction === `result-${exam.id}`
                                        ? '...'
                                        : exam.isResultReleased
                                          ? 'Hide Results'
                                          : 'Release Results'}
                                </button>

                                {!exam.isResultReleased && exam.releaseBlockedReason && (
                                    <p className="hint hint-muted">🔒 {exam.releaseBlockedReason}</p>
                                )}

                                {/* Action row 3: slot requirement. Hidden for the
                                    trial paper, which never runs slots anyway. */}
                                {!exam.isTrial && (
                                    <>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ width: '100%' }}
                                            onClick={() => toggleSlotRequirement(exam)}
                                            disabled={activeExamAction === `slot-${exam.id}`}
                                            title={
                                                exam.requiresSlot === false
                                                    ? 'Go back to requiring a booked slot'
                                                    : 'Let students sit this exam any time inside its window'
                                            }
                                        >
                                            {activeExamAction === `slot-${exam.id}`
                                                ? '...'
                                                : exam.requiresSlot === false
                                                  ? '🗓 Require a slot again'
                                                  : '🔓 Allow any time (no slot)'}
                                        </button>
                                        {exam.requiresSlot === false && (
                                            <p className="hint hint-warn">
                                                ⚠ Open to every eligible student for the whole exam
                                                window. Slots and bookings are kept.
                                            </p>
                                        )}
                                    </>
                                )}

                                {/* Timings + slots (item 6) */}
                                <a
                                    href={`/exams/${exam.id}/schedule`}
                                    className="btn btn-secondary btn-sm"
                                    style={{ textAlign: 'center', display: 'block', width: '100%', boxSizing: 'border-box' }}
                                >
                                    🗓 Edit Schedule &amp; Slots
                                </a>

                                {/* Manage Questions — primary CTA */}
                                <a
                                    href={`/questions?examId=${exam.id}`}
                                    className="btn btn-primary"
                                    style={{ textAlign: 'center', display: 'block', width: '100%', boxSizing: 'border-box' }}
                                >
                                    📚 Manage Questions &amp; Sections
                                </a>

                                {/* Retiring an exam. This — not Delete — is how an
                                    exam is taken out of circulation: it keeps every
                                    attempt, payment and certificate intact and is
                                    reversible from the same button. */}
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ width: '100%' }}
                                    onClick={() => toggleArchive(exam)}
                                    disabled={activeExamAction === exam.id}
                                    title={
                                        exam.isArchived
                                            ? 'Bring this exam back into the catalogue (as a draft)'
                                            : 'Hide from students and from this list, without deleting anything'
                                    }
                                >
                                    {activeExamAction === exam.id
                                        ? '...'
                                        : exam.isArchived
                                          ? '♻ Restore Exam'
                                          : '📦 Archive Exam'}
                                </button>

                                {/* Danger zone */}
                                <button
                                    className="btn btn-danger btn-sm"
                                    style={{ width: '100%' }}
                                    onClick={() => deleteExam(exam.id)}
                                    disabled={activeExamAction === `delete-${exam.id}`}
                                    title="Permanently removes the exam and everything attached to it. Prefer Archive."
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
