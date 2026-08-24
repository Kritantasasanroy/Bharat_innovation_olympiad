'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Source = 'PARTNER' | 'SCHOOL';
type Status = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

interface SupportTicket {
    id: string;
    source: Source;
    submitterName: string;
    submitterEmail: string;
    category: string;
    subject: string;
    message: string;
    status: Status;
    response: string | null;
    createdAt: string;
}

const STATUS_CLASS: Record<Status, string> = {
    OPEN: 'badge badge-warning',
    IN_REVIEW: 'badge badge-info',
    RESOLVED: 'badge badge-success',
};

const SOURCE_CLASS: Record<Source, string> = {
    PARTNER: 'kind-tag kind-tag--partner',
    SCHOOL: 'kind-tag kind-tag--school',
};

const REFRESH_MS = 12_000;

/**
 * Support tickets raised by partners and schools. Before this they went to an
 * in-memory store in portal-api and reached no one; now they land here, where an
 * admin can respond and resolve. Auto-refreshes so new tickets appear on their own.
 */
export default function AdminSupportPage() {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sourceFilter, setSourceFilter] = useState<'ALL' | Source>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');

    const [active, setActive] = useState<SupportTicket | null>(null);
    const [response, setResponse] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const { data } = await api.get<SupportTicket[]>('/admin/support-tickets');
            setTickets(data);
            setError(null);
        } catch {
            if (!background) setError('Could not load support tickets.');
        } finally {
            if (!background) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void load(true);
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    async function decide(status: Status) {
        if (!active) return;
        setSaving(true);
        try {
            await api.patch(`/admin/support-tickets/${active.id}`, {
                status,
                response: response.trim() || undefined,
            });
            setActive(null);
            setResponse('');
            await load();
        } catch {
            setError('Could not update the ticket.');
        } finally {
            setSaving(false);
        }
    }

    const categories = Array.from(new Set(tickets.map((t) => t.category))).sort();
    const visible = tickets.filter(
        (t) =>
            (sourceFilter === 'ALL' || t.source === sourceFilter) &&
            (statusFilter === 'ALL' || t.status === statusFilter) &&
            (categoryFilter === 'ALL' || t.category === categoryFilter),
    );
    const openCount = tickets.filter((t) => t.status !== 'RESOLVED').length;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Support tickets</h1>
                    <p className="text-muted">
                        Free-form help requests from <strong>partners and schools</strong>. Respond and mark
                        them resolved; this list refreshes on its own. Student exam grievances and re-attempt
                        requests are handled under <a href="/grievances">Student grievances</a>.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['ALL', 'PARTNER', 'SCHOOL'] as const).map((s) => (
                            <button key={s} className={`class-pill ${sourceFilter === s ? 'active' : ''}`} onClick={() => setSourceFilter(s)}>
                                {s === 'ALL' ? 'All sources' : s === 'PARTNER' ? 'Partners' : 'Schools'}
                            </button>
                        ))}
                    </div>
                    <div className="class-pills">
                        {(['ALL', 'OPEN', 'IN_REVIEW', 'RESOLVED'] as const).map((s) => (
                            <button key={s} className={`class-pill ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
                                {s === 'ALL' ? 'Any status' : s.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                    {categories.length > 0 && (
                        <div className="class-pills">
                            <button className={`class-pill ${categoryFilter === 'ALL' ? 'active' : ''}`} onClick={() => setCategoryFilter('ALL')}>
                                Any category
                            </button>
                            {categories.map((c) => (
                                <button key={c} className={`class-pill ${categoryFilter === c ? 'active' : ''}`} onClick={() => setCategoryFilter(c)}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}
                    <span className="stats-pill">{openCount} open · {tickets.length} total</span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container"><div className="spinner" /></div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>No tickets</h3>
                            <p className="text-muted">Partner and school support requests appear here.</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>From</th>
                                    <th>Subject</th>
                                    <th>Category</th>
                                    <th>Status</th>
                                    <th>Raised</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((t) => (
                                    <tr key={t.id}>
                                        <td>
                                            <span className={SOURCE_CLASS[t.source]}>{t.source}</span>
                                            <div className="student-name" style={{ marginTop: 4 }}>
                                                <span>{t.submitterName}</span>
                                                <span className="join-date">{t.submitterEmail}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <strong>{t.subject}</strong>
                                            <div className="text-muted" style={{ fontSize: '0.8rem', maxWidth: 360 }}>
                                                {t.message.length > 90 ? `${t.message.slice(0, 90)}…` : t.message}
                                            </div>
                                        </td>
                                        <td className="text-muted">{t.category}</td>
                                        <td><span className={STATUS_CLASS[t.status]}>{t.status.replace('_', ' ')}</span></td>
                                        <td className="text-muted">{new Date(t.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-sm btn-secondary" onClick={() => { setActive(t); setResponse(t.response ?? ''); }}>
                                                {t.status === 'RESOLVED' ? 'View' : 'Respond'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {active && (
                <div className="modal-overlay" onClick={() => !saving && setActive(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>{active.subject}</h2>
                        <p className="text-muted">
                            <span className={SOURCE_CLASS[active.source]}>{active.source}</span>{' '}
                            {active.submitterName} · {active.submitterEmail} · {active.category}
                        </p>
                        <div className="glass-card" style={{ padding: 'var(--space-4)', margin: 'var(--space-3) 0' }}>
                            {active.message}
                        </div>
                        <div className="form-group">
                            <label>Response (shown to the submitter)</label>
                            <textarea className="form-control" rows={3} value={response} onChange={(e) => setResponse(e.target.value)} />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setActive(null)} disabled={saving}>
                                Close
                            </button>
                            <button className="btn btn-secondary" onClick={() => decide('IN_REVIEW')} disabled={saving}>
                                Mark in review
                            </button>
                            <button className="btn btn-primary" onClick={() => decide('RESOLVED')} disabled={saving}>
                                {saving ? 'Saving…' : 'Resolve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
