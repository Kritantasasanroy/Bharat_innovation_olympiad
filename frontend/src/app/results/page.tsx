'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useEffect, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface RadarDataPoint {
    subject: string;
    A: number;
    fullMark: number;
}

interface ExamResult {
    id: string;
    title: string;
    score: number;
    total: number;
    rank?: number;
    totalStudents?: number;
    date: string;
    percentage: number | null;
    isReleased?: boolean;
    radarData?: RadarDataPoint[];
}

export default function ResultsPage() {
    const [results, setResults] = useState<ExamResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const { data } = await api.get<ExamResult[]>('/attempts/results');
                setResults(data || []);
            } catch {
                // API may not exist yet — show empty state
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, []);

    // Helper: generate a responsive tooltip style for dark/light themes
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ backgroundColor: 'var(--bg-elevated)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
                    <p style={{ margin: 0, color: 'var(--primary-400)' }}>Score: {payload[0].value}%</p>
                </div>
            );
        }
        return null;
    };

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ padding: 'var(--space-8) var(--space-6)' }}>
                <h1>Your Results Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>
                    View detailed performance analytics, dynamic webcharts, and your global ranking for completed exams.
                </p>

                {loading ? (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                ) : results.length > 0 ? (
                    <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {results.map((result) => (
                            <div key={result.id} className="glass-card result-card" style={{ display: 'flex', flexDirection: 'column', padding: '2rem' }}>
                                <div className="result-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                                    <h2>{result.title}</h2>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Attempted on: {new Date(result.date).toLocaleDateString()}</span>
                                </div>

                                {result.isReleased ? (
                                    <div className="result-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'center' }}>
                                        {/* Score Overview */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                            <div className="result-score-ring" style={{ width: '150px', height: '150px' }}>
                                                <svg viewBox="0 0 100 100" className="ring-svg" style={{ width: '100%', height: '100%' }}>
                                                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-base)" strokeWidth="8" />
                                                    <circle
                                                        cx="50" cy="50" r="42" fill="none"
                                                        stroke="url(#gradient)" strokeWidth="8"
                                                        strokeLinecap="round"
                                                        strokeDasharray={`${(result.percentage || 0) * 2.64} ${264 - (result.percentage || 0) * 2.64}`}
                                                        strokeDashoffset="66"
                                                        style={{ transition: 'stroke-dasharray 1s ease-out' }}
                                                    />
                                                    <defs>
                                                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                            <stop offset="0%" stopColor="var(--primary-400)" />
                                                            <stop offset="100%" stopColor="var(--accent-500)" />
                                                        </linearGradient>
                                                    </defs>
                                                    <text x="50" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="800">
                                                        {Math.round(result.percentage || 0)}%
                                                    </text>
                                                    <text x="50" y="64" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
                                                        {result.score} / {result.total} Marks
                                                    </text>
                                                </svg>
                                            </div>

                                            <div className="result-stats" style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem' }}>
                                                {result.rank && (
                                                    <div className="result-stat" style={{ textAlign: 'center' }}>
                                                        <div className="result-stat-value" style={{ fontSize: '1.8rem', color: 'var(--accent-400)', fontWeight: 800 }}>#{result.rank}</div>
                                                        <div className="result-stat-label" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Global Rank (Top 500)</div>
                                                    </div>
                                                )}
                                                {result.rank && result.totalStudents && (
                                                    <div className="result-stat" style={{ textAlign: 'center' }}>
                                                        <div className="result-stat-value" style={{ fontSize: '1.8rem', color: 'var(--primary-300)', fontWeight: 800 }}>Top {Math.max(1, Math.round((result.rank / result.totalStudents) * 100))}%</div>
                                                        <div className="result-stat-label" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Percentile</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Performance Webchart */}
                                        <div style={{ height: '300px', width: '100%', minWidth: '300px' }}>
                                            <h4 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Performance Webchart</h4>
                                            {result.radarData && result.radarData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={result.radarData}>
                                                        <PolarGrid stroke="var(--border-color)" />
                                                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-primary)', fontSize: 12 }} />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Radar name="Student" dataKey="A" stroke="var(--primary-400)" fill="var(--primary-500)" fillOpacity={0.5} />
                                                    </RadarChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                                    Not enough data for chart
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="result-body" style={{ textAlign: 'center', padding: '3rem 0' }}>
                                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🕒</div>
                                        <h3 style={{ color: 'var(--text-primary)' }}>Results Pending</h3>
                                        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                            Your exam has been submitted successfully. Results will appear here once released by the administrator.
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
                        <h3 style={{ marginBottom: '0.5rem' }}>No Results Yet</h3>
                        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
                            Complete an exam to see your detailed performance analytics, radar charts, and global ranking here.
                        </p>
                        <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => window.location.href = '/exams'}>
                            View Available Exams
                        </button>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
