'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import LimonAvatar from '@/components/limon/LimonAvatar';
import api from '@/lib/api';
import { XP_PER_EXAM_COMPLETE } from '@/lib/constants';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

// Brand colours — hard-coded rather than CSS vars because recharts pipes
// these straight into SVG stroke/fill attributes where `var(--…)` does NOT
// resolve in most browsers, leaving the chart invisible.
const CHART_COLORS = {
    grid:        'rgba(255, 255, 255, 0.14)',
    axisText:    '#f1f5f9',
    radiusText:  '#888888',
    radarStroke: '#ffcb05',
    radarFill:   '#ffcb05',
    tooltipBg:   '#1c1c1c',
    tooltipText: '#f1f5f9',
    tooltipBd:   'rgba(255, 255, 255, 0.12)',
    accent:      '#7dc832',
};

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
    rank?: number | null;
    totalStudents?: number | null;
    date: string;
    percentage: number | null;
    /**
     * `Exam.isResultReleased` — the legacy exam-level switch. Deliberately not
     * what this page gates the score on: `ExamService.releaseResults` refuses to
     * set it until every instance of the exam has finished, so on a paper whose
     * window runs for months it stays false and a marked attempt showed "Results
     * Pending" indefinitely. The two-stage design is provisional-then-final, and
     * the *final* stage is gated on `isFinal` (rank, percentile, answer key)
     * further down. Kept on the type because the API still returns it.
     */
    isReleased?: boolean;
    radarData?: RadarDataPoint[];
    /** Stage-two flags — see `AttemptService.getResults`. */
    isProvisional?: boolean;
    isFinal?: boolean;
    isDisqualified?: boolean;
    disqualificationNote?: string | null;
    answerKeyAvailable?: boolean;
    normalizedScore?: number | null;
    percentile?: number | null;
}

/** One question in the published answer key. */
interface ReportQuestion {
    number: number;
    questionId: string;
    text: string;
    options?: { id?: string; text: string }[] | null;
    sectionName?: string | null;
    yourAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean | null;
    marks: number;
    scored: number | null;
    explanation?: string | null;
}

// Radar charts need at least 3 axes to form a proper "web". If the backend
// sends fewer (e.g. an exam with 1–2 sections), pad with synthetic metrics
// derived from the overall result so the visual is still meaningful.
function ensureRadarShape(data: RadarDataPoint[] | undefined, result: ExamResult): RadarDataPoint[] {
    const out: RadarDataPoint[] = Array.isArray(data) ? [...data] : [];
    if (out.length >= 3) return out;

    const pct = Math.round(result.percentage ?? 0);
    const filler: RadarDataPoint[] = [
        { subject: 'Accuracy',   A: pct,                                       fullMark: 100 },
        { subject: 'Completion', A: Math.min(100, pct + 5),                    fullMark: 100 },
        { subject: 'Consistency',A: Math.max(0, Math.min(100, pct - 5)),       fullMark: 100 },
    ];
    for (const f of filler) {
        if (out.length >= 3) break;
        if (!out.some((d) => d.subject === f.subject)) out.push(f);
    }
    return out;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div style={{
                backgroundColor: CHART_COLORS.tooltipBg,
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${CHART_COLORS.tooltipBd}`,
                boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            }}>
                <p style={{ margin: 0, fontWeight: 600, color: CHART_COLORS.tooltipText }}>{label}</p>
                <p style={{ margin: '4px 0 0', color: CHART_COLORS.radarStroke }}>Score: {payload[0].value}%</p>
            </div>
        );
    }
    return null;
};

/**
 * The published answer key for one attempt, fetched on demand.
 *
 * Loaded lazily rather than with the results list: it is the whole paper with
 * explanations, it only exists after the season closes, and most visits to this
 * page are not for it.
 */
function AnswerKey({ attemptId }: { attemptId: string }) {
    const [questions, setQuestions] = useState<ReportQuestion[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);

    const load = async () => {
        setOpen(true);
        if (questions || loading) return;
        setLoading(true);
        setError('');
        try {
            const { data } = await api.get(`/attempts/${attemptId}/report`);
            setQuestions(data.questions ?? []);
        } catch {
            setError('Could not load the answer key. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <button type="button" className="btn btn-secondary answer-key__toggle" onClick={load}>
                📘 See the answer key
            </button>
        );
    }

    return (
        <div className="answer-key">
            <div className="answer-key__head">
                <h4>Answer key</h4>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(false)}>
                    Hide
                </button>
            </div>

            {loading && <div className="loading-container" style={{ minHeight: '120px' }}><div className="spinner" /></div>}
            {error && <div className="auth-error">{error}</div>}

            {questions?.map((q) => {
                const optionText = (id: string | null) => {
                    if (!id) return null;
                    const opt = q.options?.find((o, i) => (o.id ?? String(i)) === id);
                    return opt?.text ?? id;
                };
                return (
                    <div
                        key={q.questionId}
                        className={`answer-key__item ${q.isCorrect ? 'is-correct' : 'is-wrong'}`}
                    >
                        <div className="answer-key__q">
                            <span className="answer-key__num">Q{q.number}</span>
                            <span>{q.text}</span>
                        </div>
                        {q.sectionName && <div className="answer-key__section">{q.sectionName}</div>}

                        <div className="answer-key__answers">
                            <div>
                                <span className="answer-key__label">Your answer</span>
                                <span className={q.isCorrect ? 'answer-key__right' : 'answer-key__wrong'}>
                                    {optionText(q.yourAnswer) ?? 'Not answered'}
                                </span>
                            </div>
                            <div>
                                <span className="answer-key__label">Correct answer</span>
                                <span className="answer-key__right">{optionText(q.correctAnswer) ?? '-'}</span>
                            </div>
                            <div>
                                <span className="answer-key__label">Marks</span>
                                <span>{q.scored ?? 0} / {q.marks}</span>
                            </div>
                        </div>

                        {q.explanation && (
                            <p className="answer-key__why">
                                <strong>Why:</strong> {q.explanation}
                            </p>
                        )}
                    </div>
                );
            })}

            {questions?.length === 0 && !loading && (
                <p className="text-muted">The answer key for this Innovation Olympiad exam is not published yet.</p>
            )}
        </div>
    );
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

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ padding: 'var(--space-8) var(--space-6)' }}>
                <h1>Your Results Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>
                    Your performance across every exam you have taken. Scores are provisional until the
                    season closes and the final report is published.
                </p>

                {loading ? (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                ) : results.length > 0 ? (
                    <>
                        {(() => {
                            const completed = results.filter(
                                (r) => typeof r.score === 'number' && !r.isDisqualified,
                            ).length;
                            if (completed === 0) return null;
                            const totalXp = completed * XP_PER_EXAM_COMPLETE;
                            return (
                                <div
                                    className="glass-card"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-5)',
                                        padding: 'var(--space-5) var(--space-6)',
                                        marginBottom: '2rem',
                                        background: 'var(--gradient-card)',
                                    }}
                                >
                                    <LimonAvatar mood="celebrating" size={64} />
                                    <div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                                            <span
                                                style={{
                                                    background: 'var(--gradient-brand)',
                                                    WebkitBackgroundClip: 'text',
                                                    WebkitTextFillColor: 'transparent',
                                                }}
                                            >
                                                {totalXp} XP
                                            </span>{' '}
                                            earned
                                        </div>
                                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                            {completed} exam{completed === 1 ? '' : 's'} completed — keep going for more!
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}
                        <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {results.map((result) => {
                            const chartData = ensureRadarShape(result.radarData, result);
                            return (
                            <div key={result.id} className="glass-card result-card" style={{ display: 'flex', flexDirection: 'column', padding: '2rem' }}>
                                <div className="result-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                                    <h2>{result.title}</h2>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Attempted on: {new Date(result.date).toLocaleDateString()}</span>
                                </div>

                                {/* ── Disqualified: no score, no analysis, but never silent ── */}
                                {result.isDisqualified ? (
                                    <div className="result-disqualified">
                                        <div className="result-disqualified__icon" aria-hidden="true">⚖️</div>
                                        <h3>This attempt was disqualified</h3>
                                        <p>{result.disqualificationNote}</p>
                                        <Link href="/support" className="btn btn-secondary">
                                            Raise a grievance
                                        </Link>
                                    </div>
                                ) : typeof result.score === 'number' ? (
                                    <>
                                        {/* The honesty banner. A provisional score that looks
                                            final is the thing this whole two-stage design
                                            exists to prevent. */}
                                        {result.isProvisional && (
                                            <div className="result-provisional-banner">
                                                <strong>Provisional: unverified score.</strong> This can still
                                                change while proctoring reviews and grievances are settled.
                                                Your rank, full analysis and the answer key are published once
                                                the season closes.
                                            </div>
                                        )}

                                        <div
                                            className="result-body"
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                                                gap: '2rem',
                                                // stretch so the chart column actually has the height it needs;
                                                // `center` collapses recharts' ResponsiveContainer to 0
                                                alignItems: 'stretch',
                                            }}
                                        >
                                            {/* Score Overview */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                                <div className="result-score-ring" style={{ width: '150px', height: '150px' }}>
                                                    <svg viewBox="0 0 100 100" className="ring-svg" style={{ width: '100%', height: '100%' }}>
                                                        <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2a2a" strokeWidth="8" />
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
                                                                <stop offset="0%" stopColor="#ffcb05" />
                                                                <stop offset="100%" stopColor="#7dc832" />
                                                            </linearGradient>
                                                        </defs>
                                                        <text x="50" y="48" textAnchor="middle" fill="#f1f5f9" fontSize="20" fontWeight="800">
                                                            {Math.round(result.percentage || 0)}%
                                                        </text>
                                                        <text x="50" y="64" textAnchor="middle" fill="#888888" fontSize="9">
                                                            {result.score} / {result.total} Marks
                                                        </text>
                                                    </svg>
                                                </div>

                                                <div className="result-stats" style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    {/* Rank and percentile appear only once the
                                                        result is final — showing a rank computed
                                                        from a moving cohort is what makes a score
                                                        change behind a student's back. */}
                                                    {result.isFinal && result.rank ? (
                                                        <>
                                                            <div className="result-stat" style={{ textAlign: 'center' }}>
                                                                <div className="result-stat-value" style={{ fontSize: '1.8rem', color: 'var(--accent-400)', fontWeight: 800 }}>#{result.rank}</div>
                                                                <div className="result-stat-label" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Global Rank (Top 500)</div>
                                                            </div>
                                                            {typeof result.percentile === 'number' && (
                                                                <div className="result-stat" style={{ textAlign: 'center' }}>
                                                                    <div className="result-stat-value" style={{ fontSize: '1.8rem', color: 'var(--primary-300)', fontWeight: 800 }}>
                                                                        {result.percentile.toFixed(1)}
                                                                    </div>
                                                                    <div className="result-stat-label" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Percentile</div>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <p className="text-muted" style={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: '260px' }}>
                                                            Your rank and percentile are published with the final report.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Performance Webchart */}
                                            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
                                                <h4 style={{ textAlign: 'center', marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600 }}>
                                                    Performance Webchart
                                                </h4>
                                                <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
                                                    {chartData.length > 0 ? (
                                                        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                                                            <RadarChart cx="50%" cy="50%" outerRadius="78%" data={chartData}>
                                                                <PolarGrid stroke={CHART_COLORS.grid} />
                                                                <PolarAngleAxis
                                                                    dataKey="subject"
                                                                    tick={{ fill: CHART_COLORS.axisText, fontSize: 12, fontWeight: 500 }}
                                                                />
                                                                <PolarRadiusAxis
                                                                    angle={90}
                                                                    domain={[0, 100]}
                                                                    tick={{ fill: CHART_COLORS.radiusText, fontSize: 10 }}
                                                                    stroke={CHART_COLORS.grid}
                                                                    tickCount={5}
                                                                />
                                                                <Tooltip content={<CustomTooltip />} />
                                                                <Radar
                                                                    name="Score"
                                                                    dataKey="A"
                                                                    stroke={CHART_COLORS.radarStroke}
                                                                    fill={CHART_COLORS.radarFill}
                                                                    fillOpacity={0.45}
                                                                    strokeWidth={2}
                                                                    isAnimationActive
                                                                    animationDuration={800}
                                                                />
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

                                        {result.answerKeyAvailable && (
                                            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
                                                <AnswerKey attemptId={result.id} />
                                            </div>
                                        )}
                                    </>
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
                            );
                        })}
                    </div>
                    </>
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
