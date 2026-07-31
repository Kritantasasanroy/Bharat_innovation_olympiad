'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

/** The three audiences results are released to, independently (item 19). */
const AUDIENCES = ['STUDENTS', 'SCHOOLS', 'PARTNERS'] as const;
type Audience = (typeof AUDIENCES)[number];

const AUDIENCE_LABEL: Record<Audience, string> = {
    STUDENTS: 'Students',
    SCHOOLS: 'Schools',
    PARTNERS: 'Partners',
};

interface ResultInstance {
    id: string;
    examTitle: string;
    startsAt: string;
    endsAt: string;
    /** Results cannot be released until the exam is actually over. */
    hasEnded: boolean;
    attempts: number;
    certificatesIssued: number;
    normalizedAt: string | null;
    releasedAt: string | null;
    releasedTo: Record<Audience, string | null>;
    canRelease: boolean;
    /** Why the Release button is disabled, straight from the server. */
    releaseBlockedReason: string | null;
    // ── Stage two: the final report ──
    finalResultsReleasedAt: string | null;
    answerKeyReleasedAt: string | null;
    canPublishFinal: boolean;
    publishFinalBlockedReason: string | null;
    /** Attempts a human reviewer has not yet decided on. */
    pendingReviews: number;
    disqualifiedAttempts: number;
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
    const [audiences, setAudiences] = useState<Audience[]>(['STUDENTS']);
    const [revoking, setRevoking] = useState(false);

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

    /**
     * Stage two — turn provisional scores into final ones.
     *
     * Confirmation is a real prompt rather than a modal because the consequence is
     * one-way in the eyes of every student at once: the moment this fires, ranks
     * and the answer key are public. The outstanding-review count is surfaced in
     * the prompt because publishing with reviews open is exactly how a rank gets
     * published and then quietly changed.
     */
    async function publishFinal(row: ResultInstance, undo: boolean) {
        if (undo) {
            const reason = window.prompt(
                'Un-publish the final report?\n\n' +
                    'Every score in this exam returns to "provisional", and ranks and the answer key ' +
                    'are hidden again.\n\nReason (recorded in the audit log):',
            );
            if (!reason?.trim()) return;
            await run(
                row.id,
                () => api.post(`/admin/exam-instances/${row.id}/revoke-final`, { reason: reason.trim() }),
                'Final report withdrawn — scores are provisional again.',
            );
            return;
        }

        const warning =
            row.pendingReviews > 0
                ? `\n\n⚠️ ${row.pendingReviews} attempt(s) are still awaiting proctoring review. ` +
                  'Publishing now means any later disqualification will change ranks that students have already seen.'
                : '';

        const reason = window.prompt(
            'Publish the final report?\n\n' +
                'Students get their final score, rank, percentile, dimension analysis and the ' +
                'answer key with explanations. Their scores stop being labelled provisional.' +
                warning +
                '\n\nReason (recorded in the audit log):',
        );
        if (!reason?.trim()) return;

        const withAnswerKey = window.confirm(
            'Publish the answer key as well?\n\n' +
                'OK  — publish scores AND the answer key (normal).\n' +
                'Cancel — publish scores only, and hold the key back (use if a re-sit is still pending).',
        );

        await run(
            row.id,
            () =>
                api.post(`/admin/exam-instances/${row.id}/publish-final`, {
                    reason: reason.trim(),
                    withAnswerKey,
                }),
            withAnswerKey
                ? 'Final report and answer key published.'
                : 'Final report published — answer key held back.',
        );
    }

    async function submitRelease(event: FormEvent) {
        event.preventDefault();
        if (!releasing || !reason.trim() || audiences.length === 0) return;
        const row = releasing;
        const picked = [...audiences];
        const undo = revoking;
        setReleasing(null);

        const names = picked.map((a) => AUDIENCE_LABEL[a].toLowerCase()).join(' and ');
        await run(
            row.id,
            () =>
                api.post(`/admin/exam-instances/${row.id}/${undo ? 'revoke' : 'release'}`, {
                    reason: reason.trim(),
                    audiences: picked,
                }),
            undo ? `Results withdrawn from ${names}.` : `Results released to ${names}.`,
        );
        setReason('');
        setAudiences(['STUDENTS']);
        setRevoking(false);
    }

    /**
     * Downloads the results workbook. `api` returns JSON by default, so this asks
     * for a blob and hands it to the browser as a file — the Content-Disposition
     * filename the server sets is not visible to fetch, so we rebuild it here.
     */
    async function download(row: ResultInstance) {
        setBusyId(row.id);
        setError(null);
        try {
            const { data } = await api.get(`/admin/exam-instances/${row.id}/results.xlsx`, {
                responseType: 'blob',
            });
            const url = URL.createObjectURL(data as Blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bio-results-${row.examTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            setError('Could not build the results sheet.');
        } finally {
            setBusyId(null);
        }
    }

    const toggleAudience = (audience: Audience) =>
        setAudiences((prev) =>
            prev.includes(audience) ? prev.filter((a) => a !== audience) : [...prev, audience],
        );

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
                                    <th>Final report</th>
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
                                            {/* Each audience is released independently, so show all
                                                three rather than one collapsed "Released" flag. */}
                                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                {AUDIENCES.map((audience) => {
                                                    const at = row.releasedTo?.[audience];
                                                    return (
                                                        <span
                                                            key={audience}
                                                            className={`badge ${at ? 'badge-success' : 'badge-muted'}`}
                                                            title={
                                                                at
                                                                    ? `${AUDIENCE_LABEL[audience]} — released ${new Date(at).toLocaleString()}`
                                                                    : `${AUDIENCE_LABEL[audience]} cannot see these results`
                                                            }
                                                        >
                                                            {at ? '✓' : '·'} {AUDIENCE_LABEL[audience]}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td>
                                            {row.finalResultsReleasedAt ? (
                                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                    <span
                                                        className="badge badge-success"
                                                        title={`Published ${new Date(row.finalResultsReleasedAt).toLocaleString()}`}
                                                    >
                                                        ✓ Final
                                                    </span>
                                                    <span
                                                        className={`badge ${row.answerKeyReleasedAt ? 'badge-success' : 'badge-muted'}`}
                                                        title={
                                                            row.answerKeyReleasedAt
                                                                ? 'Answer key is visible to students'
                                                                : 'Answer key is held back'
                                                        }
                                                    >
                                                        {row.answerKeyReleasedAt ? '✓' : '·'} Key
                                                    </span>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span className="badge badge-warning">Provisional</span>
                                                    {/* The number that decides whether publishing now
                                                        is safe, shown where the decision is made. */}
                                                    {row.pendingReviews > 0 && (
                                                        <span
                                                            className="badge badge-danger"
                                                            title="Attempts still awaiting proctoring review — disqualifying one later would change published ranks"
                                                        >
                                                            {row.pendingReviews} to review
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {row.disqualifiedAttempts > 0 && (
                                                <div className="join-date">
                                                    {row.disqualifiedAttempts} disqualified
                                                </div>
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
                                                        setRevoking(false);
                                                        setReason('');
                                                        setAudiences(['STUDENTS']);
                                                    }}
                                                    title={row.releaseBlockedReason ?? 'Release to students, schools or partners'}
                                                >
                                                    Release…
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    disabled={busyId === row.id || !row.releasedAt}
                                                    onClick={() => {
                                                        setReleasing(row);
                                                        setRevoking(true);
                                                        setReason('');
                                                        setAudiences([]);
                                                    }}
                                                    title={
                                                        row.releasedAt
                                                            ? 'Withdraw results from an audience'
                                                            : 'Nothing has been released yet'
                                                    }
                                                >
                                                    Withdraw…
                                                </button>
                                                {/* Stage two. Until this is pressed every
                                                    student sees their score labelled
                                                    "provisional" and has no rank or key. */}
                                                {row.finalResultsReleasedAt ? (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        disabled={busyId === row.id}
                                                        onClick={() => publishFinal(row, true)}
                                                        title="Return every score in this exam to provisional"
                                                    >
                                                        Un-publish final
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        disabled={busyId === row.id || !row.canPublishFinal}
                                                        onClick={() => publishFinal(row, false)}
                                                        title={
                                                            row.publishFinalBlockedReason ??
                                                            'Publish final scores, ranks, analysis and the answer key'
                                                        }
                                                    >
                                                        Publish final…
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    disabled={busyId === row.id || row.attempts === 0}
                                                    onClick={() => download(row)}
                                                    title="Download every student's result as an Excel sheet"
                                                >
                                                    ⬇ Excel
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    disabled={busyId === row.id || !row.releasedTo?.STUDENTS}
                                                    onClick={() => generate(row)}
                                                    title={
                                                        row.releasedTo?.STUDENTS
                                                            ? 'Issue certificates'
                                                            : 'Release results to students first'
                                                    }
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
                        <h2>{revoking ? 'Withdraw results' : 'Release results'}</h2>
                        <p className="text-muted">
                            {releasing.examTitle} · {releasing.attempts} attempts.
                        </p>

                        <form className="exam-form" onSubmit={submitRelease}>
                            <div className="form-group">
                                <label>{revoking ? 'Withdraw from' : 'Release to'}</label>
                                <p className="hint hint-muted" style={{ marginBottom: '0.75rem' }}>
                                    {revoking
                                        ? 'Withdrawing from students closes their scorecards immediately.'
                                        : 'Each audience is independent. You can give schools their results to check before students see them, and never release to partners at all.'}
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {AUDIENCES.map((audience) => {
                                        const already = Boolean(releasing.releasedTo?.[audience]);
                                        // Releasing: only audiences that don't have it yet.
                                        // Withdrawing: only audiences that do.
                                        const applicable = revoking ? already : !already;

                                        return (
                                            <label
                                                key={audience}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.6rem',
                                                    opacity: applicable ? 1 : 0.45,
                                                    cursor: applicable ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    disabled={!applicable}
                                                    checked={audiences.includes(audience)}
                                                    onChange={() => toggleAudience(audience)}
                                                />
                                                <span>
                                                    <strong>{AUDIENCE_LABEL[audience]}</strong>
                                                    {already && !revoking && (
                                                        <span className="text-muted"> — already released</span>
                                                    )}
                                                    {!already && revoking && (
                                                        <span className="text-muted"> — not released</span>
                                                    )}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

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
                                        revoking
                                            ? 'e.g. Scoring error found in section 2; withdrawing pending re-run.'
                                            : 'e.g. QC complete; ranks and normalization verified.'
                                    }
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setReleasing(null)}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn ${revoking ? 'btn-danger' : 'btn-primary'}`}
                                    disabled={!reason.trim() || audiences.length === 0}
                                >
                                    {revoking ? 'Withdraw results' : 'Release results'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
