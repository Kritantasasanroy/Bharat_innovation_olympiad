'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';

interface RadarDataPoint {
    subject: string;
    A: number;
    fullMark: number;
}

interface Question {
    id: string;
    text: string;
    options: any;
    marks: number;
    correctAnswer: string;
}

interface AttemptItem {
    id: string;
    question: Question;
    answer: string | null;
    isCorrect: boolean | null;
    score: number | null;
}

interface AttemptReport {
    attempt: {
        id: string;
        status: string;
        totalScore: number;
        maxScore: number;
        submittedAt: string;
        user: {
            firstName: string;
            lastName: string;
            email: string;
            classBand: number;
            school?: { name: string };
        };
        examInstance: {
            exam: {
                title: string;
            }
        };
        items: AttemptItem[];
    };
    radarData: RadarDataPoint[];
}

export default function AttemptReportPage() {
    const params = useParams();
    const router = useRouter();
    const attemptId = params?.attemptId as string;
    
    const [report, setReport] = useState<AttemptReport | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!attemptId) return;
        const fetchReport = async () => {
            try {
                const { data } = await api.get<AttemptReport>(`/admin/attempts/${attemptId}/report`);
                setReport(data);
            } catch (err) {
                console.error('Failed to fetch report', err);
                alert('Failed to load attempt report');
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [attemptId]);

    const handlePrint = () => {
        window.print();
    };

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

    if (loading) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <div className="loading-container" style={{ minHeight: '50vh' }}>
                    <div className="spinner" />
                </div>
            </AuthGuard>
        );
    }

    if (!report) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <main className="container page-content">
                    <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                        <h2>Report Not Found</h2>
                        <button className="btn btn-primary" onClick={() => router.back()} style={{ marginTop: '1rem' }}>Go Back</button>
                    </div>
                </main>
            </AuthGuard>
        );
    }

    const { attempt, radarData } = report;
    const percentage = attempt.maxScore ? (attempt.totalScore / attempt.maxScore) * 100 : 0;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <div className="no-print">
                <Navbar />
            </div>
            
            <main className="container page-content print-container">
                <style dangerouslySetInnerHTML={{__html: `
                    @media print {
                        body { background: white; color: black; }
                        .no-print { display: none !important; }
                        .glass-card { background: white !important; border: 1px solid #ddd !important; box-shadow: none !important; color: black !important; }
                        h1, h2, h3, h4, p, span, strong { color: black !important; }
                        .ring-svg text { fill: black !important; }
                        .print-container { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
                        .page-content { padding-top: 0 !important; }
                        .recharts-text { fill: black !important; }
                        .item-correct { background-color: #f0fdf4 !important; border-color: #bbf7d0 !important; }
                        .item-incorrect { background-color: #fef2f2 !important; border-color: #fecaca !important; }
                        .item-unanswered { background-color: #f3f4f6 !important; border-color: #e5e7eb !important; }
                    }
                    .item-correct { border-left: 4px solid var(--success-500); }
                    .item-incorrect { border-left: 4px solid var(--danger-500); }
                    .item-unanswered { border-left: 4px solid var(--text-muted); }
                `}} />

                <div className="page-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            &larr; Back to Analytics
                        </button>
                        <h1>Attempt Report</h1>
                    </div>
                    <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Download / Print
                    </button>
                </div>

                <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{attempt.user.firstName} {attempt.user.lastName}</h2>
                            <p style={{ color: 'var(--text-secondary)' }}>{attempt.user.email} &bull; Class {attempt.user.classBand} &bull; {attempt.user.school?.name || 'N/A'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h3 style={{ fontSize: '1.4rem', color: 'var(--primary-400)' }}>{attempt.examInstance.exam.title}</h3>
                            <p style={{ color: 'var(--text-secondary)' }}>Submitted: {new Date(attempt.submittedAt).toLocaleString()}</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'center' }}>
                        {/* Score Overview */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                            <div className="result-score-ring" style={{ width: '180px', height: '180px' }}>
                                <svg viewBox="0 0 100 100" className="ring-svg" style={{ width: '100%', height: '100%' }}>
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-base)" strokeWidth="8" />
                                    <circle
                                        cx="50" cy="50" r="42" fill="none"
                                        stroke="url(#gradient)" strokeWidth="8"
                                        strokeLinecap="round"
                                        strokeDasharray={`${percentage * 2.64} ${264 - percentage * 2.64}`}
                                        strokeDashoffset="66"
                                    />
                                    <defs>
                                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="var(--primary-400)" />
                                            <stop offset="100%" stopColor="var(--accent-500)" />
                                        </linearGradient>
                                    </defs>
                                    <text x="50" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="800">
                                        {Math.round(percentage)}%
                                    </text>
                                    <text x="50" y="64" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
                                        {attempt.totalScore} / {attempt.maxScore} Marks
                                    </text>
                                </svg>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <span className={`status-pill ${attempt.status.toLowerCase()}`}>{attempt.status.replace('_', ' ')}</span>
                            </div>
                        </div>

                        {/* Performance Webchart */}
                        <div style={{ height: '300px', width: '100%', minWidth: '300px' }}>
                            <h4 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Performance Webchart</h4>
                            {radarData && radarData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
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
                </div>

                <div className="glass-card" style={{ padding: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Question Breakdown</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {attempt.items.map((item, index) => {
                            let statusClass = 'item-unanswered';
                            let statusText = 'Unanswered';
                            
                            if (item.answer !== null) {
                                if (item.isCorrect) {
                                    statusClass = 'item-correct';
                                    statusText = 'Correct';
                                } else {
                                    statusClass = 'item-incorrect';
                                    statusText = 'Incorrect';
                                }
                            }

                            const options = item.question.options as { id: string; text: string; isCorrect: boolean }[];
                            const studentOption = options?.find(o => o.id === item.answer || o.id === item.answer?.toString() || options.findIndex(opt => opt.id === o.id).toString() === item.answer);
                            const correctOption = options?.find(o => o.isCorrect);

                            return (
                                <div key={item.id} className={`${statusClass}`} style={{ padding: '1.5rem', backgroundColor: 'var(--bg-elevated)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <strong>Question {index + 1}</strong>
                                        <span style={{ fontWeight: 'bold' }}>Score: {item.score || 0} / {item.question.marks}</span>
                                    </div>
                                    <p style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{item.question.text}</p>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: 'var(--bg-base)', padding: '1rem', borderRadius: '4px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Student's Answer:</div>
                                            <div style={{ fontWeight: 500, color: item.answer === null ? 'var(--text-muted)' : (item.isCorrect ? 'var(--success-400)' : 'var(--danger-400)') }}>
                                                {item.answer === null ? 'Did not answer' : (studentOption?.text || String(item.answer))}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Correct Answer:</div>
                                            <div style={{ fontWeight: 500, color: 'var(--success-400)' }}>
                                                {correctOption?.text || item.question.correctAnswer || 'Unknown'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}
