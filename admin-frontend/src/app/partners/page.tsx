'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type PartnerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
type Decision = 'APPROVED' | 'REJECTED' | 'REVOKED';

interface PartnerRequest {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    status: PartnerRequestStatus;
    partnerId: string | null;
    decisionReason: string | null;
    decidedBy: string | null;
    decidedAt: string | null;
    createdAt: string;
}

const STATUS_CLASS: Record<PartnerRequestStatus, string> = {
    PENDING: 'badge badge-warning',
    APPROVED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
    REVOKED: 'badge badge-danger',
};

/** Which actions make sense from each status (the access state machine). */
function actionsFor(status: PartnerRequestStatus): Decision[] {
    switch (status) {
        case 'PENDING':
            return ['APPROVED', 'REJECTED'];
        case 'APPROVED':
            return ['REVOKED'];
        case 'REJECTED':
        case 'REVOKED':
            return ['APPROVED'];
    }
}

const ACTION_LABEL: Record<Decision, string> = {
    APPROVED: 'Grant access',
    REJECTED: 'Reject',
    REVOKED: 'Revoke access',
};

/**
 * Partner Management (spec Admin #25) — the review queue for partner access
 * requests, plus grant / reject / revoke / re-grant.
 *
 * Talks to the legacy backend (`/admin/partner-requests`), which is the
 * orchestrator: it records the decision and mirrors it into the admin-api
 * partner engine (`Partner.status`), the gate portal-api checks on every
 * dashboard request. So a revoke here removes the partner's dashboard access
 * immediately, even while their token is still valid.
 */
export default function PartnersPage() {
    const [requests, setRequests] = useState<PartnerRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'ALL' | PartnerRequestStatus>('ALL');

    // Reason modal
    const [pending, setPending] = useState<{ req: PartnerRequest; decision: Decision } | null>(null);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get<PartnerRequest[]>('/admin/partner-requests');
            setRequests(data);
        } catch {
            setError('Could not load partner requests.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function submitDecision(event: FormEvent) {
        event.preventDefault();
        if (!pending || !reason.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            await api.patch(`/admin/partner-requests/${pending.req.id}`, {
                decision: pending.decision,
                reason: reason.trim(),
            });
            setPending(null);
            setReason('');
            await load();
        } catch {
            setError(`Could not ${ACTION_LABEL[pending.decision].toLowerCase()}. Is the partner engine (admin-api) running?`);
        } finally {
            setSubmitting(false);
        }
    }

    const visible = filter === 'ALL' ? requests : requests.filter((r) => r.status === filter);
    const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Partner Management</h1>
                    <p className="text-muted">
                        Review partner access requests and grant, reject or revoke access. Revoking takes
                        effect on the partner&apos;s next request.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const).map((f) => (
                            <button
                                key={f}
                                className={`class-pill ${filter === f ? 'active' : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                    <span className="stats-pill">
                        {pendingCount} awaiting review · {requests.length} total
                    </span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>No partner requests</h3>
                            <p className="text-muted">
                                Partners request access from the partner portal&apos;s “Request access” page.
                            </p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Organisation</th>
                                    <th>Contact</th>
                                    <th>Requested</th>
                                    <th>Status</th>
                                    <th>Last decision</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((req) => (
                                    <tr key={req.id}>
                                        <td>
                                            <div className="student-name">
                                                <strong>{req.orgName}</strong>
                                                <span className="join-date">{req.phone}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="student-name">
                                                <span>{req.contactPerson}</span>
                                                <span className="join-date">{req.email}</span>
                                            </div>
                                        </td>
                                        <td className="text-muted">
                                            {new Date(req.createdAt).toLocaleDateString('en-IN', {
                                                dateStyle: 'medium',
                                            })}
                                        </td>
                                        <td>
                                            <span className={STATUS_CLASS[req.status]}>{req.status}</span>
                                        </td>
                                        <td className="text-muted">
                                            {req.decisionReason ? (
                                                <span title={req.decisionReason}>
                                                    {req.decisionReason.length > 40
                                                        ? `${req.decisionReason.slice(0, 40)}…`
                                                        : req.decisionReason}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                {actionsFor(req.status).map((decision) => (
                                                    <button
                                                        key={decision}
                                                        className={`btn btn-sm ${decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                                                        onClick={() => {
                                                            setPending({ req, decision });
                                                            setReason('');
                                                        }}
                                                    >
                                                        {ACTION_LABEL[decision]}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {pending && (
                <div className="modal-overlay" onClick={() => !submitting && setPending(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>{ACTION_LABEL[pending.decision]}</h2>
                        <p className="text-muted">
                            {pending.req.orgName} · {pending.req.email}
                        </p>
                        <form className="exam-form" onSubmit={submitDecision}>
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
                                    placeholder={
                                        pending.decision === 'APPROVED'
                                            ? 'e.g. Verified organisation; approved for the 2026 cycle.'
                                            : 'e.g. Duplicate application / policy violation.'
                                    }
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setPending(null)}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn ${pending.decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                                    disabled={submitting || !reason.trim()}
                                >
                                    {submitting ? 'Saving…' : ACTION_LABEL[pending.decision]}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
