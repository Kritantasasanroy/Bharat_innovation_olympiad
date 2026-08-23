'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * Post-exam proctoring review.
 *
 * "A human proctor reviews serious cases as per certain logic, confirm cheating
 * and prepares logs, evidences and leading to disqualification."
 *
 * Distinct from `/proctor`, which watches exams happening *now*. This is the
 * after-the-fact queue: finished attempts whose risk score crossed the threshold,
 * ordered worst-first, each opened with its full event timeline as evidence.
 *
 * The design constraint throughout: nothing here decides anything automatically.
 * The risk score chooses what a person *looks at*; the person decides, and has to
 * write down why.
 */

const EVENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    NO_FACE:            { label: 'No Face',         color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    MULTIPLE_FACES:     { label: 'Multi-Face',      color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    FACE_MISMATCH:      { label: 'ID Mismatch',     color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
    LOOKING_AWAY:       { label: 'Looking Away',    color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
    TAB_SWITCH:         { label: 'Tab Switch',      color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    EXIT_FULLSCREEN:    { label: 'Fullscreen Exit', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    SCREEN_CAPTURE:     { label: 'Screen Capture',  color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
    NETWORK_DISCONNECT: { label: 'Disconnected',    color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
    SEB_VIOLATION:      { label: 'SEB Violation',   color: '#7c3aed', bg: 'rgba(124,58,237,0.15)' },
    IP_CHANGE:          { label: 'IP Change',       color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
};

const REVIEW_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:      { label: 'Awaiting review', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
    CLEARED:      { label: 'Cleared',         color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
    DISQUALIFIED: { label: 'Disqualified',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    NOT_REQUIRED: { label: 'Not flagged',     color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};

function riskColor(score: number): string {
    if (score >= 0.5) return 'var(--danger-400)';
    if (score >= 0.2) return 'var(--warning-400)';
    return 'var(--success-400)';
}

function groupEvents(events: ProctorEvent[]): EventGroup[] {
    const sorted = [...events].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
    const groups: EventGroup[] = [];
    for (const ev of sorted) {
        const last = groups[groups.length - 1];
        if (last && last.type === ev.type && last.severity === ev.severity) {
            last.events.push(ev);
        } else {
            groups.push({ key: `${ev.type}-${ev.severity}-${groups.length}`, type: ev.type, severity: ev.severity, events: [ev] });
        }
    }
    return groups;
}

interface QueueRow {
    attemptId: string;
    status: string;
    reviewStatus: string;
    reviewedAt: string | null;
    reviewNotes: string | null;
    riskScore: number;
    submittedAt: string | null;
    totalScore: number | null;
    maxScore: number | null;
    student: {
        name: string;
        email: string;
        rollNumber: string | null;
        classBand: number | null;
        school: string | null;
    };
    examTitle: string;
    totalEvents: number;
    eventCounts: Record<string, number>;
}

interface ProctorEvent {
    id: string;
    timestamp: string;
    type: string;
    severity: number;
}

interface EventGroup {
    key: string;
    type: string;
    severity: number;
    events: ProctorEvent[];
}

export default function ProctorReviewPage() {
    const [rows, setRows] = useState<QueueRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');

    const [openId, setOpenId] = useState<string | null>(null);
    const [evidence, setEvidence] = useState<any>(null);
    const [evidenceLoading, setEvidenceLoading] = useState(false);

    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get<QueueRow[]>('/proctor/review/queue', {
                params: filter === 'PENDING' ? { status: 'PENDING' } : {},
            });
            setRows(data);
            setError(null);
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not load the review queue.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { void load(); }, [load]);

    const openCase = async (attemptId: string) => {
        setOpenId(attemptId);
        setEvidence(null);
        setNotes('');
        setActionError(null);
        setEvidenceLoading(true);
        try {
            const { data } = await api.get(`/proctor/review/${attemptId}`);
            setEvidence(data);
        } catch (e: any) {
            setActionError(e.response?.data?.message ?? 'Could not load the evidence.');
        } finally {
            setEvidenceLoading(false);
        }
    };

    const decide = async (verdict: 'CLEARED' | 'DISQUALIFIED') => {
        if (!openId || !notes.trim()) {
            setActionError('Write your reasoning first — it is recorded with the decision.');
            return;
        }
        if (
            verdict === 'DISQUALIFIED' &&
            !window.confirm(
                'Disqualify this attempt?\n\nThe student loses their score, rank and certificate for this exam, ' +
                'and is removed from the rankings. They will be told, and can raise a grievance.',
            )
        ) {
            return;
        }

        setSaving(true);
        setActionError(null);
        try {
            await api.post(`/proctor/review/${openId}`, { verdict, notes: notes.trim() });
            setOpenId(null);
            await load();
        } catch (e: any) {
            setActionError(e.response?.data?.message ?? 'Could not record the decision.');
        } finally {
            setSaving(false);
        }
    };

    const pending = rows.filter((r) => r.reviewStatus === 'PENDING').length;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                    <div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Post-Exam Review</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                            Finished attempts flagged by proctoring, worst first. Nothing here has been
                            decided automatically — you decide, and your reasoning is recorded.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                            className={`btn btn-sm ${filter === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilter('PENDING')}
                        >
                            Awaiting review {pending > 0 ? `(${pending})` : ''}
                        </button>
                        <button
                            className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilter('ALL')}
                        >
                            All reviewed
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => void load()}>Refresh</button>
                    </div>
                </div>

                {loading && <div className="glass-card" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>Loading…</div>}
                {error && !loading && <div className="glass-card" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--danger-400)' }}>{error}</div>}

                {!loading && !error && rows.length === 0 && (
                    <div className="glass-card" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>✅</div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
                            {filter === 'PENDING' ? 'Nothing is waiting for review.' : 'No attempts have been reviewed yet.'}
                        </p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 'var(--space-2)' }}>
                            Attempts are queued here automatically when their risk score crosses the threshold.
                        </p>
                    </div>
                )}

                {rows.length > 0 && (
                    <div className="glass-card table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Exam</th>
                                    <th>Risk</th>
                                    <th>Flags</th>
                                    <th>Status</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const badge = REVIEW_BADGE[row.reviewStatus] ?? REVIEW_BADGE.NOT_REQUIRED;
                                    return (
                                        <tr key={row.attemptId}>
                                            <td>
                                                <strong>{row.student.name}</strong>
                                                <div className="join-date">
                                                    {row.student.rollNumber ?? row.student.email}
                                                    {row.student.classBand ? ` · Class ${row.student.classBand}` : ''}
                                                </div>
                                            </td>
                                            <td>{row.examTitle}</td>
                                            <td>
                                                <span style={{ color: riskColor(row.riskScore), fontWeight: 700 }}>
                                                    {(row.riskScore * 100).toFixed(0)}%
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                    {Object.entries(row.eventCounts).map(([type, count]) => {
                                                        const meta = EVENT_LABELS[type] ?? { label: type, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };
                                                        return (
                                                            <span key={type} style={{ fontSize: '0.7rem', background: meta.bg, color: meta.color, padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                                                                {meta.label} ×{count}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '0.72rem', background: badge.bg, color: badge.color, padding: '0.15rem 0.55rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-primary" onClick={() => void openCase(row.attemptId)}>
                                                    Review →
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── One case, with its evidence ── */}
                {openId && (
                    <div className="modal-overlay" onClick={() => !saving && setOpenId(null)}>
                        <div className="modal-content modal-content--wide" onClick={(e) => e.stopPropagation()}>
                            <h2>Review attempt</h2>

                            {evidenceLoading && <p className="text-muted">Loading the evidence…</p>}

                            {evidence && (
                                <>
                                    <div className="review-facts">
                                        <div><span>Student</span><strong>{evidence.student?.name}</strong></div>
                                        <div><span>Roll number</span><strong>{evidence.rollNumber ?? '—'}</strong></div>
                                        <div><span>School</span><strong>{evidence.student?.school ?? '—'}</strong></div>
                                        <div><span>Exam</span><strong>{evidence.exam?.title}</strong></div>
                                        <div><span>Risk score</span><strong style={{ color: riskColor(evidence.attempt?.riskScore ?? 0) }}>{((evidence.attempt?.riskScore ?? 0) * 100).toFixed(0)}%</strong></div>
                                        <div><span>Score</span><strong>{evidence.attempt?.totalScore ?? '—'} / {evidence.attempt?.maxScore ?? '—'}</strong></div>
                                        <div><span>IP address</span><strong>{evidence.session?.ipAddress ?? '—'}</strong></div>
                                        <div><span>Events</span><strong>{evidence.totalEvents}</strong></div>
                                    </div>

                                    {/* The timeline, not just the counts. Six "looking away"
                                        events over an hour is a student thinking; six in
                                        ninety seconds is something else, and only the
                                        sequence shows the difference. */}
                                    <h3 style={{ fontSize: '0.95rem', marginTop: 'var(--space-5)' }}>Event timeline</h3>
                                    <div className="review-timeline">
                                        {(evidence.events ?? []).length === 0 && (
                                            <p className="text-muted">No events were recorded for this attempt.</p>
                                        )}
                                        {groupEvents((evidence.events ?? []) as ProctorEvent[]).map((group) => {
                                            const meta = EVENT_LABELS[group.type] ?? { label: group.type, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };
                                            const isExpanded = expandedGroups.has(group.key);
                                            if (group.events.length === 1) {
                                                const ev = group.events[0];
                                                return (
                                                    <div key={group.key} className="review-timeline__row">
                                                        <time>{new Date(ev.timestamp).toLocaleTimeString()}</time>
                                                        <span style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                                                        <small>severity {ev.severity}</small>
                                                    </div>
                                                );
                                            }
                                            const first = group.events[0];
                                            const last = group.events[group.events.length - 1];
                                            const sameMinute = new Date(first.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ===
                                                new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            return (
                                                <div key={group.key} className="review-timeline__group">
                                                    <div
                                                        className="review-timeline__group-summary"
                                                        onClick={() => {
                                                            const next = new Set(expandedGroups);
                                                            if (next.has(group.key)) next.delete(group.key);
                                                            else next.add(group.key);
                                                            setExpandedGroups(next);
                                                        }}
                                                    >
                                                        <time>
                                                            {new Date(first.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            {sameMinute ? '' : ` – ${new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                                        </time>
                                                        <span style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                                                        <small>{group.events.length} events · severity {group.severity}</small>
                                                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{isExpanded ? '▲' : '▼'}</span>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="review-timeline__group-details">
                                                            {group.events.map((ev) => (
                                                                <time key={ev.id}>{new Date(ev.timestamp).toLocaleTimeString()}</time>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {evidence.review?.status !== 'PENDING' && evidence.review?.notes && (
                                        <div className="review-previous">
                                            <strong>Previously {evidence.review.status.toLowerCase()}</strong>
                                            <p>{evidence.review.notes}</p>
                                        </div>
                                    )}

                                    <label className="input-label" htmlFor="reviewNotes" style={{ marginTop: 'var(--space-5)', display: 'block' }}>
                                        Your reasoning <span style={{ color: 'var(--danger-400)' }}>*</span>
                                    </label>
                                    <textarea
                                        id="reviewNotes"
                                        className="form-control"
                                        rows={5}
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="What the evidence shows, and what you concluded from it. Recorded permanently and shown if the student appeals."
                                    />
                                    <p className="input-hint" style={{ marginTop: 'var(--space-2)' }}>
                                        Disqualifying removes this attempt from the rankings, certificates and
                                        exports. It cannot be done once the final report for this exam is
                                        published — revoke the report first.{' '}
                                        <Link href={`/analytics/attempt/${openId}`}>See the score report →</Link>
                                    </p>

                                    {actionError && <div className="form-error" style={{ marginTop: 'var(--space-3)' }}>{actionError}</div>}

                                    <div className="modal-actions" style={{ marginTop: 'var(--space-5)' }}>
                                        <button className="btn btn-secondary" onClick={() => setOpenId(null)} disabled={saving}>
                                            Cancel
                                        </button>
                                        <button className="btn btn-secondary" onClick={() => void decide('CLEARED')} disabled={saving || !notes.trim()}>
                                            {saving ? 'Saving…' : 'Clear — no action'}
                                        </button>
                                        <button className="btn btn-danger" onClick={() => void decide('DISQUALIFIED')} disabled={saving || !notes.trim()}>
                                            {saving ? 'Saving…' : 'Disqualify'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
