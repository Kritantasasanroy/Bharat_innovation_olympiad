'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import Cookies from 'js-cookie';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ProctorEvent {
    id: string;
    type: string;
    severity: number;
    details: Record<string, any>;
    timestamp: string;
}

interface ProctorReport {
    attemptId: string;
    student: {
        id: string;
        name: string;
        email: string;
        classBand: number | null;
        school: string | null;
    };
    exam: {
        title: string;
        durationMinutes: number;
    };
    attempt: {
        status: string;
        startedAt: string | null;
        submittedAt: string | null;
        totalScore: number | null;
        maxScore: number | null;
        riskScore: number;
    };
    events: ProctorEvent[];
    totalEvents: number;
    summary: Record<string, number>;
}

const EVENT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    NO_FACE:            { label: 'No Face',        color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '👤' },
    MULTIPLE_FACES:     { label: 'Multi-Face',     color: '#f97316', bg: 'rgba(249,115,22,0.12)',  icon: '👥' },
    FACE_MISMATCH:      { label: 'ID Mismatch',    color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   icon: '⚠️' },
    LOOKING_AWAY:       { label: 'Looking Away',   color: '#eab308', bg: 'rgba(234,179,8,0.12)',   icon: '👀' },
    TAB_SWITCH:         { label: 'Tab Switch',     color: '#f97316', bg: 'rgba(249,115,22,0.12)',  icon: '🔄' },
    EXIT_FULLSCREEN:    { label: 'Fullscreen Exit',color: '#f97316', bg: 'rgba(249,115,22,0.12)',  icon: '⛶' },
    SCREEN_CAPTURE:     { label: 'Screen Capture', color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   icon: '📸' },
    NETWORK_DISCONNECT: { label: 'Disconnected',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)', icon: '📡' },
    SEB_VIOLATION:      { label: 'SEB Violation',  color: '#7c3aed', bg: 'rgba(124,58,237,0.12)',  icon: '🔒' },
    IP_CHANGE:          { label: 'IP Change',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: '🌐' },
};

function riskColor(score: number) {
    if (score >= 0.5) return '#ef4444';
    if (score >= 0.2) return '#eab308';
    return '#22c55e';
}

function riskLabel(score: number) {
    if (score >= 0.5) return 'HIGH RISK';
    if (score >= 0.2) return 'MEDIUM RISK';
    return 'LOW RISK';
}

function formatDuration(start: string | null, end: string | null): string {
    if (!start) return '—';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const secs = Math.floor((e - s) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: string | null): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StudentProctorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const attemptId = params?.attemptId as string;

    const [report, setReport] = useState<ProctorReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>('ALL');

    useEffect(() => {
        if (!attemptId) return;
        const token = Cookies.get('admin_token');
        fetch(`${API}/proctor/report/${attemptId}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((d) => { setReport(d); setLoading(false); })
            .catch((e) => { setError(e.message); setLoading(false); });
    }, [attemptId]);

    if (loading) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="spinner" />
                </div>
            </AuthGuard>
        );
    }

    if (error || !report) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <main className="container page-content">
                    <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
                        <h2 style={{ color: 'var(--danger-400)' }}>Report Not Found</h2>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{error}</p>
                        <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => router.back()}>← Go Back</button>
                    </div>
                </main>
            </AuthGuard>
        );
    }

    const { student, exam, attempt, events, summary } = report;
    const filteredEvents = filterType === 'ALL' ? events : events.filter((e) => e.type === filterType);
    const eventTypes = Object.keys(summary);
    const pct = (attempt.maxScore && attempt.totalScore != null)
        ? Math.round((attempt.totalScore / attempt.maxScore) * 100) : null;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content" style={{ maxWidth: '1100px' }}>

                {/* Back nav */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <Link href="/proctor" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        ← Live Monitoring
                    </Link>
                </div>

                {/* ── Student header ── */}
                <div className="glass-card" style={{ padding: '1.75rem 2rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>{student.name}</h1>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {student.email}
                                {student.classBand && <> · Class {student.classBand}</>}
                                {student.school && <> · {student.school}</>}
                            </p>
                            <p style={{ color: 'var(--primary-400)', fontSize: '0.9rem', marginTop: '0.4rem', fontWeight: 500 }}>{exam.title}</p>
                        </div>

                        {/* Risk score */}
                        <div style={{ textAlign: 'center', minWidth: '120px' }}>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: riskColor(attempt.riskScore), lineHeight: 1 }}>
                                {Math.round(attempt.riskScore * 100)}%
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: riskColor(attempt.riskScore), letterSpacing: '0.08em', marginTop: '0.25rem' }}>
                                {riskLabel(attempt.riskScore)}
                            </div>
                            <div style={{ height: '6px', background: 'var(--bg-elevated)', borderRadius: '999px', marginTop: '0.5rem', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(attempt.riskScore * 100, 100)}%`, background: riskColor(attempt.riskScore), borderRadius: '999px', transition: 'width 0.5s' }} />
                            </div>
                        </div>
                    </div>

                    {/* Attempt meta row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
                        {[
                            { label: 'Status',    value: attempt.status.replace('_', ' ') },
                            { label: 'Started',   value: formatDate(attempt.startedAt) },
                            { label: 'Submitted', value: formatDate(attempt.submittedAt) },
                            { label: 'Duration',  value: formatDuration(attempt.startedAt, attempt.submittedAt) },
                            { label: 'Score',     value: attempt.totalScore != null ? `${attempt.totalScore} / ${attempt.maxScore} (${pct}%)` : '—' },
                            { label: 'Violations',value: report.totalEvents.toString() },
                        ].map(({ label, value }) => (
                            <div key={label}>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{label}</p>
                                <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Event type summary cards ── */}
                {eventTypes.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        {eventTypes.map((type) => {
                            const meta = EVENT_META[type] ?? { label: type, color: 'var(--text-primary)', bg: 'var(--bg-elevated)', icon: '•' };
                            return (
                                <button
                                    key={type}
                                    onClick={() => setFilterType(filterType === type ? 'ALL' : type)}
                                    style={{
                                        background: filterType === type ? meta.bg : 'var(--bg-elevated)',
                                        border: `1px solid ${filterType === type ? meta.color : 'var(--border-color)'}`,
                                        borderRadius: '10px', padding: '0.9rem 1rem', textAlign: 'left', cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div style={{ fontSize: '1.2rem', marginBottom: '0.3rem' }}>{meta.icon}</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: meta.color }}>{summary[type]}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{meta.label}</div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Event timeline ── */}
                <div className="glass-card" style={{ padding: '1.5rem 2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                            Event Timeline
                            {filterType !== 'ALL' && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                                    — filtered: {EVENT_META[filterType]?.label ?? filterType}
                                </span>
                            )}
                        </h2>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {filterType !== 'ALL' && (
                                <button
                                    onClick={() => setFilterType('ALL')}
                                    style={{ fontSize: '0.8rem', background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer' }}
                                >
                                    Clear filter
                                </button>
                            )}
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    {filteredEvents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                            {filterType === 'ALL' ? 'No proctoring violations recorded for this attempt.' : `No ${EVENT_META[filterType]?.label ?? filterType} events.`}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', position: 'relative' }}>
                            {/* Vertical line */}
                            <div style={{ position: 'absolute', left: '19px', top: '24px', bottom: '24px', width: '2px', background: 'var(--border-color)' }} />

                            {filteredEvents.map((event, i) => {
                                const meta = EVENT_META[event.type] ?? { label: event.type, color: 'var(--text-primary)', bg: 'var(--bg-elevated)', icon: '•' };
                                return (
                                    <div key={event.id} style={{ display: 'flex', gap: '1rem', paddingBottom: i < filteredEvents.length - 1 ? '1rem' : 0, alignItems: 'flex-start' }}>
                                        {/* Timeline dot */}
                                        <div style={{
                                            width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                                            background: meta.bg, border: `2px solid ${meta.color}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1rem', zIndex: 1, position: 'relative',
                                        }}>
                                            {meta.icon}
                                        </div>

                                        {/* Event card */}
                                        <div style={{
                                            flex: 1, background: 'var(--bg-elevated)', borderRadius: '10px',
                                            border: `1px solid ${meta.color}22`, padding: '0.75rem 1rem',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{
                                                        fontSize: '0.75rem', fontWeight: 700, color: meta.color,
                                                        background: meta.bg, padding: '0.15rem 0.5rem', borderRadius: '4px',
                                                    }}>
                                                        {meta.label}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        severity {event.severity}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                                    {formatTime(event.timestamp)}
                                                </span>
                                            </div>

                                            {/* Details */}
                                            {event.details && Object.keys(event.details).length > 0 && (
                                                <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {Object.entries(event.details).map(([k, v]) => (
                                                        <span key={k} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                                            {k}: {String(v)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Bottom action */}
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href="/proctor" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textDecoration: 'none' }}>
                        ← Back to Live Monitoring
                    </Link>
                    <Link
                        href={`/analytics/attempt/${attemptId}`}
                        style={{ fontSize: '0.875rem', color: 'var(--primary-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                        View Score Report →
                    </Link>
                </div>
            </main>
        </AuthGuard>
    );
}
