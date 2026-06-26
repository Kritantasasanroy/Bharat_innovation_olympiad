'use client';

import { useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import Link from 'next/link';
import { LiveMonitoringEntry } from '@/types/proctor';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_INTERVAL_MS = 15_000;

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
    NO_FACE:           { label: 'No Face',        color: 'bg-red-500' },
    MULTIPLE_FACES:    { label: 'Multi-Face',     color: 'bg-orange-500' },
    FACE_MISMATCH:     { label: 'ID Mismatch',    color: 'bg-red-600' },
    LOOKING_AWAY:      { label: 'Looking Away',   color: 'bg-yellow-500' },
    TAB_SWITCH:        { label: 'Tab Switch',     color: 'bg-orange-400' },
    EXIT_FULLSCREEN:   { label: 'Fullscreen Exit',color: 'bg-orange-400' },
    SCREEN_CAPTURE:    { label: 'Screen Capture', color: 'bg-red-700' },
    NETWORK_DISCONNECT:{ label: 'Disconnect',     color: 'bg-gray-500' },
    SEB_VIOLATION:     { label: 'SEB Violation',  color: 'bg-purple-600' },
    IP_CHANGE:         { label: 'IP Change',      color: 'bg-blue-500' },
};

function riskColor(score: number): string {
    if (score >= 0.5) return 'text-red-500';
    if (score >= 0.2) return 'text-yellow-500';
    return 'text-green-500';
}

function riskBarColor(score: number): string {
    if (score >= 0.5) return 'bg-red-500';
    if (score >= 0.2) return 'bg-yellow-400';
    return 'bg-green-500';
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
        const token = Cookies.get('admin_token');
        try {
            const res = await fetch(`${API}/proctor/live?since=10`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: LiveMonitoringEntry[] = await res.json();
            setEntries(data);
            setLastRefreshed(new Date());
            setError(null);
        } catch (e: any) {
            setError(e.message ?? 'Failed to fetch live data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLive();
        timerRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const highRisk  = entries.filter((e) => e.riskScore >= 0.5).length;
    const medRisk   = entries.filter((e) => e.riskScore >= 0.2 && e.riskScore < 0.5).length;
    const lowRisk   = entries.filter((e) => e.riskScore < 0.2).length;

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Live Exam Monitoring</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        face-api.js client-side proctoring · auto-refreshes every 15s
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs bg-green-900/40 text-green-400 border border-green-700 px-3 py-1.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Live
                    </span>
                    {lastRefreshed && (
                        <span className="text-xs text-gray-500">
                            Updated {lastRefreshed.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={fetchLive}
                        className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        Refresh now
                    </button>
                </div>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Active Students', value: entries.length, color: 'text-blue-400' },
                    { label: 'High Risk (≥0.5)', value: highRisk,      color: 'text-red-400' },
                    { label: 'Medium Risk',       value: medRisk,       color: 'text-yellow-400' },
                    { label: 'Low Risk',           value: lowRisk,       color: 'text-green-400' },
                ].map((stat) => (
                    <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                        <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Loading / error / empty */}
            {loading && (
                <div className="text-center text-gray-500 py-20">Loading active sessions…</div>
            )}
            {error && (
                <div className="text-center text-red-400 py-20">{error}</div>
            )}
            {!loading && !error && entries.length === 0 && (
                <div className="text-center py-20">
                    <p className="text-gray-500 text-lg">No active exam sessions right now.</p>
                    <p className="text-gray-600 text-sm mt-2">Students taking exams will appear here automatically.</p>
                </div>
            )}

            {/* Student grid */}
            {entries.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {entries.map((entry) => (
                        <div
                            key={entry.attemptId}
                            className={`bg-gray-900 border rounded-xl p-5 flex flex-col gap-3 ${
                                entry.riskScore >= 0.5
                                    ? 'border-red-700'
                                    : entry.riskScore >= 0.2
                                    ? 'border-yellow-700'
                                    : 'border-gray-800'
                            }`}
                        >
                            {/* Student info */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="font-semibold text-white">{entry.studentName}</p>
                                    <p className="text-xs text-gray-400">{entry.studentEmail}</p>
                                </div>
                                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-lg">
                                    {elapsed(entry.startedAt)}
                                </span>
                            </div>

                            {/* Exam title */}
                            <p className="text-sm text-blue-300 truncate">{entry.examTitle}</p>

                            {/* Risk score */}
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-400">Risk Score</span>
                                    <span className={`font-bold ${riskColor(entry.riskScore)}`}>
                                        {(entry.riskScore * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${riskBarColor(entry.riskScore)}`}
                                        style={{ width: `${Math.min(entry.riskScore * 100, 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Event counts */}
                            {Object.keys(entry.eventCounts).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(entry.eventCounts).map(([type, count]) => {
                                        const meta = EVENT_LABELS[type] ?? { label: type, color: 'bg-gray-600' };
                                        return (
                                            <span
                                                key={type}
                                                className={`inline-flex items-center gap-1 text-xs ${meta.color} text-white px-2 py-0.5 rounded-full`}
                                            >
                                                {meta.label}
                                                <span className="font-bold">×{count}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            {Object.keys(entry.eventCounts).length === 0 && (
                                <p className="text-xs text-gray-600 italic">No violations in last 10 minutes</p>
                            )}

                            {/* Actions */}
                            <Link
                                href={`/analytics/attempt/${entry.attemptId}`}
                                className="text-xs text-center bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-3 py-2 rounded-lg transition-colors mt-1"
                            >
                                Full Report →
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
