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
    const [showHelp, setShowHelp] = useState(false);

    const [releasing, setReleasing] = useState<ResultInstance | null>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const { data } = await api.get<ResultInstance[]>('/admin/results');
            setInstances(data);
            setError(null);
        } catch {
            if (!background) setError('Could not load exam instances.');
        } finally {
            if (!background) setLoading(false);
        }
    }, []);

    // Initial load + live refresh, so status updates without a manual reload.
    useEffect(() => {
        void load();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void load(true);
        }, 10_000);
        return () => clearInterval(id);
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
                        The pipeline runs in order: <strong>Normalize → Release → Issue certificates</strong>.
                        Each step unlocks the next.{' '}
                        <button
                            type="button"
                            className="info-chip"
                            aria-label="What do these steps mean?"
                            onClick={() => setShowHelp((v) => !v)}
                        >
                            ⓘ What do these mean?
                        </button>
                    </p>
                </div>

                {showHelp && (
                    <div className="glass-card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
                        <dl className="help-grid">
                            <div>
                                <dt>1 · Normalize (fair-score processing)</dt>
                                <dd>
                                    Raw marks from different question sets aren&apos;t directly comparable, so
                                    normalization converts every attempt to a fair, comparable score and computes
                                    each student&apos;s <strong>percentile and rank</strong>. You run this once per
                                    exam; re-running before release just recomputes from the latest attempts. It
                                    changes nothing students can see yet.
                                </dd>
                            </div>
                            <div>
                                <dt>2 · Release</dt>
                                <dd>
                                    Publishes the normalized scorecards to students. Requires a written reason
                                    (audit-logged) and can only happen after normalization. Once released, results
                                    are locked — you cannot re-normalize.
                                </dd>
                            </div>
                            <div>
                                <dt>3 · Issue certificates</dt>
                                <dd>
                                    Generates a verifiable certificate for each eligible student. Only possible
                                    after results are released. The count in the table shows how many exist.
                                </dd>
                            </div>
                        </dl>
                    </div>
                )}

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
                                                <span
                                                    className="badge badge-success"
                                                    title={`Normalized ${new Date(row.normalizedAt).toLocaleString()}`}
                                                >
                                                    ✓ Done
                                                </span>
                                            ) : (
                                                <span className="badge badge-warning">Pending</span>
                                            )}
                                        </td>
                                        <td>
                                            {row.releasedAt ? (
                                                <span
                                                    className="badge badge-success"
                                                    title={`Released ${new Date(row.releasedAt).toLocaleString()}`}
                                                >
                                                    ✓ Released
                                                </span>
                                            ) : (
                                                <span className="badge" title="Normalize, then release">Not released</span>
                                            )}
                                        </td>
                                        <td>
                                            {row.certificatesIssued > 0 ? (
                                                <span className="badge badge-success">
                                                    ✓ {row.certificatesIssued} issued
                                                </span>
                                            ) : row.releasedAt ? (
                                                <span className="badge badge-warning">None yet</span>
                                            ) : (
                                                <span className="text-muted">—</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    disabled={busyId === row.id || Boolean(row.releasedAt)}
                                                    onClick={() => normalize(row)}
                                                    title={
                                                        row.releasedAt
                                                            ? 'Cannot re-normalize released results'
                                                            : row.normalizedAt
                                                              ? 'Already normalized — re-run only if new attempts came in'
                                                              : 'Run fair-score processing'
                                                    }
                                                >
                                                    {busyId === row.id
                                                        ? 'Working…'
                                                        : row.normalizedAt
                                                          ? 'Re-normalize'
                                                          : 'Normalize'}
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
