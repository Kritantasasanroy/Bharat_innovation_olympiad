'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

interface ResultInstance {
    id: string;
    examTitle: string;
    startsAt: string;
    attempts: number;
    certificatesIssued: number;
    normalizedAt: string | null;
    releasedAt: string | null;
    canRelease: boolean;
}

/**
 * Results integrity chain (spec Admin §19/§20/§21).
 *
 * The order is enforced by the backend, and mirrored here: normalize -> release
 * -> issue certificates. Nothing downstream is offered until its prerequisite
 * is done, so an admin cannot accidentally publish raw, non-comparable marks.
 */
export default function ResultsPage() {
    const [instances, setInstances] = useState<ResultInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [releasing, setReleasing] = useState<ResultInstance | null>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get<ResultInstance[]>('/admin/results');
            setInstances(data);
        } catch {
            setError('Could not load exam instances.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function run(id: string, action: () => Promise<unknown>, success: string) {
        setBusyId(id);
        setError(null);
        setNotice(null);
        try {
            await action();
            setNotice(success);
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'That action failed.');
        } finally {
            setBusyId(null);
        }
    }

    const normalize = (row: ResultInstance) =>
        run(row.id, () => api.post(`/admin/exam-instances/${row.id}/normalize`), 'Scores normalized.');

    const generate = (row: ResultInstance) =>
        run(
            row.id,
            () => api.post(`/admin/exam-instances/${row.id}/certificates`),
            'Certificates issued.',
        );

    async function submitRelease(event: FormEvent) {
        event.preventDefault();
        if (!releasing || !reason.trim()) return;
        const row = releasing;
        setReleasing(null);
        await run(
            row.id,
            () => api.post(`/admin/exam-instances/${row.id}/release`, { reason: reason.trim() }),
            'Results released to students.',
        );
        setReason('');
    }

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Results &amp; certificates</h1>
                    <p className="text-muted">
                        Fair-score processing must complete before results can be released, and results must
                        be released before certificates can be issued.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}
                {notice && (
                    <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                        {notice}
                    </div>
                )}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : instances.length === 0 ? (
                        <div className="empty-state">
                            <h3>No exam instances</h3>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Exam</th>
                                    <th>Attempts</th>
                                    <th>Normalized</th>
                                    <th>Released</th>
                                    <th>Certificates</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {instances.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <div className="student-name">
                                                <strong>{row.examTitle}</strong>
                                                <span className="join-date">
                                                    {new Date(row.startsAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{row.attempts}</td>
                                        <td>
                                            {row.normalizedAt ? (
                                                <span className="badge badge-success">Done</span>
                                            ) : (
                                                <span className="badge badge-warning">Pending</span>
                                            )}
                                        </td>
                                        <td>
                                            {row.releasedAt ? (
                                                <span className="badge badge-success">Released</span>
                                            ) : (
                                                <span className="badge">Gated</span>
                                            )}
                                        </td>
                                        <td>{row.certificatesIssued}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    disabled={busyId === row.id || Boolean(row.releasedAt)}
                                                    onClick={() => normalize(row)}
                                                    title={row.releasedAt ? 'Cannot re-normalize released results' : ''}
                                                >
                                                    Normalize
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    disabled={busyId === row.id || !row.canRelease}
                                                    onClick={() => {
                                                        setReleasing(row);
                                                        setReason('');
                                                    }}
                                                    title={!row.canRelease ? 'Normalize first' : ''}
                                                >
                                                    Release
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    disabled={busyId === row.id || !row.releasedAt}
                                                    onClick={() => generate(row)}
                                                    title={!row.releasedAt ? 'Release results first' : ''}
                                                >
                                                    Issue certificates
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {releasing && (
                <div className="modal-overlay" onClick={() => setReleasing(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>Release results</h2>
                        <p className="text-muted">
                            {releasing.examTitle} · {releasing.attempts} attempts. Students will immediately be
                            able to see their scorecard.
                        </p>
                        <form className="exam-form" onSubmit={submitRelease}>
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
                                    placeholder="e.g. QC complete; ranks and normalization verified."
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setReleasing(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={!reason.trim()}>
                                    Release results
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
