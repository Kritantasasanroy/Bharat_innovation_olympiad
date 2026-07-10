'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Status = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ISSUED';

interface RefundRequest {
    id: string;
    reason: string;
    status: Status;
    eligible: boolean;
    eligibilityNote: string | null;
    decisionReason: string | null;
    createdAt: string;
    user: { firstName: string; lastName: string; email: string };
    payment: { amount: number; status: string; razorpayPaymentId: string | null };
}

const STATUS_CLASS: Record<Status, string> = {
    REQUESTED: 'badge badge-warning',
    APPROVED: 'badge badge-warning',
    ISSUED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
};

/**
 * Refund review & approval (spec Admin §22/§23).
 *
 * Approving re-runs the automatic eligibility check and then issues the refund
 * through Razorpay immediately — so an approval on a request that has since
 * passed the cutoff is refused rather than silently paid out.
 */
export default function RefundsPage() {
    const [items, setItems] = useState<RefundRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'ALL' | Status>('ALL');

    const [pending, setPending] = useState<{ row: RefundRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get<RefundRequest[]>('/admin/refunds');
            setItems(data);
        } catch {
            setError('Could not load refund requests.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!pending || !reason.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/refunds/${pending.row.id}`, {
                decision: pending.decision,
                reason: reason.trim(),
            });
            setPending(null);
            setReason('');
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'Could not record the decision.');
        } finally {
            setBusy(false);
        }
    }

    const visible = filter === 'ALL' ? items : items.filter((i) => i.status === filter);
    const awaiting = items.filter((i) => i.status === 'REQUESTED').length;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Refund requests</h1>
                    <p className="text-muted">
                        Eligibility is checked automatically at request time and again on approval. Approving
                        issues the refund through Razorpay straight away.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['ALL', 'REQUESTED', 'APPROVED', 'ISSUED', 'REJECTED'] as const).map((f) => (
                            <button
                                key={f}
                                className={`class-pill ${filter === f ? 'active' : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                    <span className="stats-pill">{awaiting} awaiting review</span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>No refund requests</h3>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Amount</th>
                                    <th>Auto-eligibility</th>
                                    <th>Reason</th>
                                    <th>Status</th>
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
                                        <td>₹{(row.payment.amount / 100).toFixed(2)}</td>
                                        <td>
                                            {row.eligible ? (
                                                <span className="badge badge-success">Eligible</span>
                                            ) : (
                                                <span className="badge badge-danger" title={row.eligibilityNote ?? ''}>
                                                    Not eligible
                                                </span>
                                            )}
                                            {row.eligibilityNote && (
                                                <div className="join-date">{row.eligibilityNote}</div>
                                            )}
                                        </td>
                                        <td className="text-muted">{row.reason}</td>
                                        <td>
                                            <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {row.status === 'REQUESTED' && (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => {
                                                            setPending({ row, decision: 'APPROVED' });
                                                            setReason('');
                                                        }}
                                                    >
                                                        Approve &amp; issue
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => {
                                                            setPending({ row, decision: 'REJECTED' });
                                                            setReason('');
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
                        <h2>{pending.decision === 'APPROVED' ? 'Approve & issue refund' : 'Reject refund'}</h2>
                        <p className="text-muted">
                            ₹{(pending.row.payment.amount / 100).toFixed(2)} — {pending.row.user.email}
                        </p>
                        {pending.decision === 'APPROVED' && !pending.row.eligible && (
                            <div className="form-error">
                                The automatic check said this is not eligible: {pending.row.eligibilityNote}. The
                                backend re-checks on approval and will refuse if it still fails.
                            </div>
                        )}
                        <form className="exam-form" onSubmit={submit}>
                            <div className="form-group">
                                <label htmlFor="reason">Reason (required, recorded in the audit log)</label>
                                <textarea
                                    id="reason"
                                    className="form-control"
                                    rows={3}
                                    required
                                    autoFocus
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn ${pending.decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                                    disabled={busy || !reason.trim()}
                                >
                                    {busy ? 'Processing…' : 'Confirm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
