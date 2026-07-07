'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

interface ExamSlot {
    id: string;
    label: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    booked: number;
    examInstance: {
        id: string;
        startsAt: string;
        endsAt: string;
        exam: {
            id: string;
            title: string;
            feeAmount: number | null;
        };
    };
}

interface Exam {
    id: string;
    title: string;
}

interface ExamInstance {
    id: string;
    startsAt: string;
    endsAt: string;
}

interface SlotBooking {
    id: string;
    status: string;
    createdAt: string;
    user: { id: string; email: string; firstName: string; lastName: string };
    payment: { status: string; amount: number } | null;
}

type ModalMode = 'create' | 'edit' | null;

function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

function fmtDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function toLocalInput(dateStr: string) {
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminSlotsPage() {
    const [slots, setSlots] = useState<ExamSlot[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [instances, setInstances] = useState<ExamInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterExamId, setFilterExamId] = useState('');
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [editingSlot, setEditingSlot] = useState<ExamSlot | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [bookingsModal, setBookingsModal] = useState<{ slotId: string; label: string } | null>(null);
    const [bookings, setBookings] = useState<SlotBooking[]>([]);
    const [bookingsLoading, setBookingsLoading] = useState(false);

    const [form, setForm] = useState({
        examId: '',
        examInstanceId: '',
        label: '',
        startsAt: '',
        endsAt: '',
        capacity: 100,
    });

    const fetchSlots = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await api.get<ExamSlot[]>('/admin/slots');
            setSlots(data);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchExams = useCallback(async () => {
        try {
            const { data } = await api.get<Exam[]>('/admin/exams');
            setExams(data);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        fetchSlots();
        fetchExams();
    }, [fetchSlots, fetchExams]);

    // Load instances when exam selected in modal
    useEffect(() => {
        if (!form.examId) { setInstances([]); return; }
        api.get<ExamInstance[]>(`/admin/exams/${form.examId}/instances`)
            .then(({ data }) => setInstances(data))
            .catch(() => setInstances([]));
    }, [form.examId]);

    const openCreate = () => {
        setEditingSlot(null);
        setForm({ examId: '', examInstanceId: '', label: '', startsAt: '', endsAt: '', capacity: 100 });
        setError('');
        setModalMode('create');
    };

    const openEdit = (slot: ExamSlot) => {
        setEditingSlot(slot);
        setForm({
            examId: slot.examInstance.exam.id,
            examInstanceId: slot.examInstance.id,
            label: slot.label ?? '',
            startsAt: toLocalInput(slot.startsAt),
            endsAt: toLocalInput(slot.endsAt),
            capacity: slot.capacity,
        });
        setError('');
        setModalMode('edit');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!form.examInstanceId || !form.startsAt || !form.endsAt) {
            setError('Please fill all required fields.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                examInstanceId: form.examInstanceId,
                label: form.label || undefined,
                startsAt: new Date(form.startsAt).toISOString(),
                endsAt: new Date(form.endsAt).toISOString(),
                capacity: Number(form.capacity),
            };
            if (modalMode === 'create') {
                await api.post('/admin/slots', payload);
            } else if (editingSlot) {
                await api.put(`/admin/slots/${editingSlot.id}`, payload);
            }
            setModalMode(null);
            fetchSlots();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
            setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save slot.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (slot: ExamSlot) => {
        if (slot.booked > 0) { alert('Cannot delete a slot that has active bookings.'); return; }
        if (!confirm(`Delete slot "${slot.label || fmtDate(slot.startsAt)}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/admin/slots/${slot.id}`);
            fetchSlots();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            alert(msg ?? 'Failed to delete slot.');
        }
    };

    const openBookings = async (slot: ExamSlot) => {
        setBookingsModal({ slotId: slot.id, label: slot.label || fmtDate(slot.startsAt) });
        setBookingsLoading(true);
        try {
            const { data } = await api.get<SlotBooking[]>(`/admin/slots/${slot.id}/bookings`);
            setBookings(data);
        } catch {
            setBookings([]);
        } finally {
            setBookingsLoading(false);
        }
    };

    // Group slots by exam title
    const grouped = slots.reduce<Record<string, { title: string; slots: ExamSlot[] }>>((acc, slot) => {
        const { id, title } = slot.examInstance.exam;
        if (filterExamId && id !== filterExamId) return acc;
        if (!acc[id]) acc[id] = { title, slots: [] };
        acc[id].slots.push(slot);
        return acc;
    }, {});

    const statusColor = (booked: number, capacity: number) => {
        const pct = (booked / capacity) * 100;
        if (pct >= 100) return '#ef4444';
        if (pct >= 80) return '#f59e0b';
        return '#22c55e';
    };

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)' }}>
                    <div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Slot Management</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                            Create and manage exam time slots for student bookings.
                        </p>
                    </div>
                    <button className="btn btn-primary" onClick={openCreate}>
                        + Create Slot
                    </button>
                </div>

                {/* Filter */}
                <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-6)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Filter by Exam:</label>
                    <select
                        className="form-input"
                        value={filterExamId}
                        onChange={e => setFilterExamId(e.target.value)}
                        style={{ maxWidth: 340 }}
                    >
                        <option value="">All Exams</option>
                        {exams.map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.title}</option>
                        ))}
                    </select>
                    {filterExamId && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setFilterExamId('')}>Clear</button>
                    )}
                    <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                        {slots.filter(s => !filterExamId || s.examInstance.exam.id === filterExamId).length} slot(s) total
                    </span>
                </div>

                {/* Slot list */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-secondary)' }}>Loading slots…</div>
                ) : Object.keys(grouped).length === 0 ? (
                    <div className="glass-card" style={{ padding: 'var(--space-16)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>🗓️</div>
                        <p style={{ color: 'var(--text-secondary)' }}>No slots found. Create your first slot to get started.</p>
                    </div>
                ) : (
                    Object.entries(grouped).map(([, { title, slots: examSlots }]) => (
                        <div key={title} style={{ marginBottom: 'var(--space-8)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</h2>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: 'var(--radius-full)' }}>
                                    {examSlots.length} slot{examSlots.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                                            {['Label', 'Start', 'End', 'Booked / Capacity', 'Instance Window', 'Actions'].map(h => (
                                                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {examSlots.map(slot => {
                                            const pct = Math.min(100, (slot.booked / slot.capacity) * 100);
                                            const color = statusColor(slot.booked, slot.capacity);
                                            return (
                                                <tr key={slot.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background var(--transition-fast)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        <span style={{ fontWeight: 500 }}>{slot.label || '—'}</span>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                        {fmt(slot.startsAt)}
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                                        {fmt(slot.endsAt)}
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)', minWidth: 160 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                                            <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                                                                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 'var(--radius-full)', transition: 'width 0.3s ease' }} />
                                                            </div>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 500, color, whiteSpace: 'nowrap' }}>
                                                                {slot.booked} / {slot.capacity}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                                        {fmtDate(slot.examInstance.startsAt)} – {fmtDate(slot.examInstance.endsAt)}
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => openBookings(slot)}>
                                                                Bookings ({slot.booked})
                                                            </button>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(slot)}>Edit</button>
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)', border: '1px solid rgba(239,68,68,0.2)' }}
                                                                onClick={() => handleDelete(slot)}
                                                                disabled={slot.booked > 0}
                                                                title={slot.booked > 0 ? 'Cannot delete a slot with bookings' : ''}
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}

                {/* Create / Edit Slot Modal */}
                {modalMode && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)' }}>
                        <div className="glass-card" style={{ width: '100%', maxWidth: 520, padding: 'var(--space-8)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--space-6)' }}>
                                {modalMode === 'create' ? 'Create New Slot' : 'Edit Slot'}
                            </h2>
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                {modalMode === 'create' && (
                                    <div className="form-group">
                                        <label className="form-label">Exam *</label>
                                        <select className="form-input" value={form.examId} onChange={e => setForm(f => ({ ...f, examId: e.target.value, examInstanceId: '' }))} required>
                                            <option value="">Select exam…</option>
                                            {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                                        </select>
                                    </div>
                                )}
                                {modalMode === 'create' && (
                                    <div className="form-group">
                                        <label className="form-label">Exam Instance *</label>
                                        <select className="form-input" value={form.examInstanceId} onChange={e => setForm(f => ({ ...f, examInstanceId: e.target.value }))} required disabled={!form.examId || instances.length === 0}>
                                            <option value="">
                                                {!form.examId ? 'Select exam first' : instances.length === 0 ? 'No instances found' : 'Select instance…'}
                                            </option>
                                            {instances.map(inst => (
                                                <option key={inst.id} value={inst.id}>
                                                    {fmtDate(inst.startsAt)} – {fmtDate(inst.endsAt)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="form-label">Label (optional)</label>
                                    <input className="form-input" placeholder="e.g. Morning Batch" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Slot Starts At *</label>
                                        <input type="datetime-local" className="form-input" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Slot Ends At *</label>
                                        <input type="datetime-local" className="form-input" value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Capacity (max students) *</label>
                                    <input type="number" className="form-input" min={1} max={10000} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} required />
                                </div>
                                {error && <p style={{ color: 'var(--danger-400)', fontSize: '0.875rem' }}>{error}</p>}
                                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                                        {submitting ? 'Saving…' : modalMode === 'create' ? 'Create Slot' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Bookings Modal */}
                {bookingsModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)' }}>
                        <div className="glass-card" style={{ width: '100%', maxWidth: 680, padding: 'var(--space-8)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                                    Bookings — {bookingsModal.label}
                                </h2>
                                <button className="btn btn-sm btn-secondary" onClick={() => setBookingsModal(null)}>✕ Close</button>
                            </div>
                            {bookingsLoading ? (
                                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--space-8)' }}>Loading bookings…</p>
                            ) : bookings.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--space-8)' }}>No bookings yet for this slot.</p>
                            ) : (
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                                                {['Student', 'Email', 'Status', 'Payment', 'Booked At'].map(h => (
                                                    <th key={h} style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bookings.map(b => (
                                                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontWeight: 500 }}>
                                                        {b.user.firstName} {b.user.lastName}
                                                    </td>
                                                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.user.email}</td>
                                                    <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                                                        <span style={{
                                                            fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                                            background: b.status === 'CONFIRMED' ? 'rgba(34,197,94,0.15)' : b.status === 'PENDING' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                                            color: b.status === 'CONFIRMED' ? 'var(--success-400)' : b.status === 'PENDING' ? 'var(--warning-400)' : 'var(--danger-400)',
                                                        }}>
                                                            {b.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {b.payment ? `₹${(b.payment.amount / 100).toLocaleString('en-IN')} · ${b.payment.status}` : '—'}
                                                    </td>
                                                    <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                                        {new Date(b.createdAt).toLocaleDateString('en-IN')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
