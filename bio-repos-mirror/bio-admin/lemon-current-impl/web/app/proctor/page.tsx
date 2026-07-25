'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { LiveMonitoringEntry } from '@/types/proctor';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 15_000;

const EVENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    NO_FACE:            { label: 'No Face',        color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    MULTIPLE_FACES:     { label: 'Multi-Face',     color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    FACE_MISMATCH:      { label: 'ID Mismatch',    color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
    LOOKING_AWAY:       { label: 'Looking Away',   color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
    TAB_SWITCH:         { label: 'Tab Switch',     color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    EXIT_FULLSCREEN:    { label: 'Fullscreen Exit',color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    SCREEN_CAPTURE:     { label: 'Screen Capture', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
    NETWORK_DISCONNECT: { label: 'Disconnected',   color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
    SEB_VIOLATION:      { label: 'SEB Violation',  color: '#7c3aed', bg: 'rgba(124,58,237,0.15)' },
    IP_CHANGE:          { label: 'IP Change',      color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
};

function riskColor(score: number): string {
    if (score >= 0.5) return 'var(--danger-400)';
    if (score >= 0.2) return 'var(--warning-400)';
    return 'var(--success-400)';
}

function elapsed(startedAt: string): string {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

export default function LiveProctorPage() {
    const [entries, setEntries] = useState<LiveMonitoringEntry[]>([]);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLive = async () => {
        try {
            const { data } = await api.get<LiveMonitoringEntry[]>('/proctor/live', { params: { since: 10 } });
            setEntries(data);
            setLastRefreshed(new Date());
            setError(null);
        } catch (e: any) {
            setError(e.response?.data?.message ?? e.message ?? 'Failed to fetch live data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLive();
        timerRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const highRisk = entries.filter((e) => e.riskScore >= 0.5).length;
    const medRisk = entries.filter((e) => e.riskScore >= 0.2 && e.riskScore < 0.5).length;
    const lowRisk = entries.filter((e) => e.riskScore < 0.2).length;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
                    <div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Live Exam Monitoring</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                            face-api.js client-side proctoring · auto-refreshes every 15s
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem',
                            background: 'rgba(34,197,94,0.12)', color: 'var(--success-400)',
                            border: '1px solid rgba(34,197,94,0.3)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)',
                        }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success-400)' }} className="animate-pulse" />
                            Live
                        </span>
                        {lastRefreshed && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                Updated {lastRefreshed.toLocaleTimeString()}
                            </span>
                        )}
                        <button className="btn btn-sm btn-secondary" onClick={fetchLive}>Refresh now</button>
                    </div>
                </div>

                {/* Summary bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
                    {[
                        { label: 'Active Students', value: entries.length, color: 'var(--primary-400)' },
                        { label: 'High Risk (≥50%)', value: highRisk, color: 'var(--danger-400)' },
                        { label: 'Medium Risk', value: medRisk, color: 'var(--warning-400)' },
                        { label: 'Low Risk', value: lowRisk, color: 'var(--success-400)' },
                    ].map((stat) => (
                        <div key={stat.label} className="glass-card" style={{ padding: 'var(--space-5)' }}>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>{stat.label}</p>
                            <p style={{ fontSize: '1.75rem', fontWeight: 700, color: stat.color }}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Loading / error / empty */}
                {loading && (
                    <div className="glass-card" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading active sessions…</div>
                )}
                {error && !loading && (
                    <div className="glass-card" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--danger-400)' }}>{error}</div>
                )}
                {!loading && !error && entries.length === 0 && (
                    <div className="glass-card" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>🟢</div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>No active exam sessions right now.</p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 'var(--space-2)' }}>Students taking exams will appear here automatically.</p>
                    </div>
                )}

                {/* Student grid */}
                {entries.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
                        {entries.map((entry) => (
                            <div
                                key={entry.attemptId}
                                className="glass-card"
                                style={{
                                    padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
                                    border: entry.riskScore >= 0.5 ? '1px solid rgba(239,68,68,0.4)'
                                        : entry.riskScore >= 0.2 ? '1px solid rgba(234,179,8,0.4)' : undefined,
                                }}
                            >
                                {/* Student info */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ fontWeight: 600 }}>{entry.studentName}</p>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{entry.studentEmail}</p>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-md)', whiteSpace: 'nowrap' }}>
                                        {elapsed(entry.startedAt)}
                                    </span>
                                </div>

                                {/* Exam title */}
                                <p style={{ fontSize: '0.875rem', color: 'var(--primary-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.examTitle}</p>

                                {/* Risk score */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Risk Score</span>
                                        <span style={{ fontWeight: 700, color: riskColor(entry.riskScore) }}>
                                            {(entry.riskScore * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%', width: `${Math.min(entry.riskScore * 100, 100)}%`,
                                            background: riskColor(entry.riskScore), borderRadius: 'var(--radius-full)', transition: 'width 0.5s',
                                        }} />
                                    </div>
                                </div>

                                {/* Event counts */}
                                {Object.keys(entry.eventCounts).length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {Object.entries(entry.eventCounts).map(([type, count]) => {
                                            const meta = EVENT_LABELS[type] ?? { label: type, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };
                                            return (
                                                <span
                                                    key={type}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem',
                                                        background: meta.bg, color: meta.color, padding: '0.15rem 0.55rem', borderRadius: 'var(--radius-full)', fontWeight: 600,
                                                    }}
                                                >
                                                    {meta.label} ×{count}
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No violations in last 10 minutes</p>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                                    <Link
                                        href={`/proctor/${entry.attemptId}`}
                                        className="btn btn-sm btn-primary"
                                        style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                                    >
                                        Proctor Detail →
                                    </Link>
                                    <Link
                                        href={`/analytics/attempt/${entry.attemptId}`}
                                        className="btn btn-sm btn-secondary"
                                        style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                                    >
                                        Score Report →
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
