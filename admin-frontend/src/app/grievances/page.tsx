'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Status = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

interface Grievance {
    id: string;
    type: 'GRIEVANCE' | 'REATTEMPT';
    subject: string;
    description: string;
    status: Status;
    resolution: string | null;
    createdAt: string;
    user: { firstName: string; lastName: string; email: string };
    attempt: { id: string; totalScore: number | null } | null;
}

const STATUS_CLASS: Record<Status, string> = {
    OPEN: 'badge badge-warning',
    IN_REVIEW: 'badge badge-warning',
    RESOLVED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
};

/** Grievance & re-attempt decisions (spec Admin §24). */
export default function GrievancesPage() {
    const [items, setItems] = useState<Grievance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'ALL' | Status>('ALL');

    const [pending, setPending] = useState<{ row: Grievance; status: 'RESOLVED' | 'REJECTED' } | null>(null);
    const [resolution, setResolution] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const { data } = await api.get<Grievance[]>('/admin/grievances');
            setItems(data);
            setError(null);
        } catch {
            if (!background) setError('Could not load grievances.');
        } finally {
            if (!background) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void load(true);
        }, 12_000);
        return () => clearInterval(id);
    }, [load]);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!pending || !resolution.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/grievances/${pending.row.id}`, {
                status: pending.status,
                resolution: resolution.trim(),
            });
            setPending(null);
            setResolution('');
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'Could not record the decision.');
        } finally {
            setBusy(false);
        }
    }

    const visible = filter === 'ALL' ? items : items.filter((i) => i.status === filter);
    const open = items.filter((i) => i.status === 'OPEN' || i.status === 'IN_REVIEW').length;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Grievances &amp; re-attempts</h1>
                    <p className="text-muted">
                        Approving a re-attempt resets the student&apos;s attempt so they can sit it again. The
                        original submission is snapshotted into the audit log first.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['ALL', 'OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const).map((f) => (
                            <button
                                key={f}
                                className={`class-pill ${filter === f ? 'active' : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f === 'ALL' ? 'All' : f.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                    <span className="stats-pill">{open} awaiting decision</span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>Nothing here</h3>
                            <p className="text-muted">Students raise these from the support page.</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Type</th>
                                    <th>Subject</th>
                                    <th>Status</th>
                                    <th>Outcome</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <div className="student-name">
                                                <span>
                                                    {row.user.firstName} {row.user.lastName}
                                                </span>
                                                <span className="join-date">{row.user.email}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={row.type === 'REATTEMPT' ? 'badge badge-primary' : 'badge'}>
                                                {row.type === 'REATTEMPT' ? 'Re-attempt' : 'Grievance'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="student-name">
                                                <strong>{row.subject}</strong>
                                                <span className="join-date">{row.description.slice(0, 70)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={STATUS_CLASS[row.status]}>{row.status.replace('_', ' ')}</span>
                                        </td>
                                        <td className="text-muted">{row.resolution ?? '—'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {(row.status === 'OPEN' || row.status === 'IN_REVIEW') && (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => {
                                                            setPending({ row, status: 'RESOLVED' });
                                                            setResolution('');
                                                        }}
                                                    >
                                                        {row.type === 'REATTEMPT' ? 'Grant re-attempt' : 'Resolve'}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => {
                                                            setPending({ row, status: 'REJECTED' });
                                                            setResolution('');
                                                        }}
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {pending && (
                <div className="modal-overlay" onClick={() => !busy && setPending(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>{pending.status === 'RESOLVED' ? 'Resolve' : 'Reject'}</h2>
                        <p className="text-muted">
                            {pending.row.subject} — {pending.row.user.email}
                        </p>
                        {pending.status === 'RESOLVED' && pending.row.type === 'REATTEMPT' && (
                            <div className="form-error">
                                This will clear the student&apos;s answers and reset their attempt so they can
                                retake it. The original score is preserved in the audit log.
                            </div>
                        )}
                        <form className="exam-form" onSubmit={submit}>
                            <div className="form-group">
                                <label htmlFor="resolution">Resolution (required, shown to the student)</label>
                                <textarea
                                    id="resolution"
                                    className="form-control"
                                    rows={3}
                                    required
                                    autoFocus
                                    value={resolution}
                                    onChange={(e) => setResolution(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn ${pending.status === 'RESOLVED' ? 'btn-primary' : 'btn-danger'}`}
                                    disabled={busy || !resolution.trim()}
                                >
                                    {busy ? 'Saving…' : 'Confirm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
