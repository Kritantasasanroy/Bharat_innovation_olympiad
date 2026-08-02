'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import PaymentTerms from '@/components/PaymentTerms';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Phase =
    | 'DRAFT'
    | 'SCHEDULED'
    | 'NEEDS_SLOT'
    | 'SLOT_UPCOMING'
    | 'OPEN'
    | 'SLOT_MISSED'
    | 'ENDED';

interface ExamInstance {
    id: string;
    startsAt: string;
    phase: Phase;
    canStart: boolean;
}

interface AvailableExam {
    id: string;
    title: string;
    durationMinutes: number;
    phase: Phase;
    canStart: boolean;
    isCompleted?: boolean;
    startBlockedReason?: string | null;
    instances?: ExamInstance[];
}

interface ResultSummary {
    id: string;
    examTitle: string;
    score: number;
    totalMarks: number;
    rank?: number;
    completedAt: string;
    /**
     * `Exam.isResultReleased`. Not what the score is gated on — see the note on
     * `ExamResult.isReleased` in `app/results/page.tsx`. Kept because the API
     * still returns it.
     */
    isReleased?: boolean;
    /** True until the final report is published — the score can still move. */
    isProvisional?: boolean;
    /** A disqualified attempt carries no score, and must not show a 0 as if it did. */
    isDisqualified?: boolean;
}

/** What the non-startable phases say on the dashboard, in the student's words. */
const PHASE_LABEL: Record<Phase, string> = {
    DRAFT: 'Unavailable',
    SCHEDULED: 'Not open yet',
    NEEDS_SLOT: 'Slot needed',
    SLOT_UPCOMING: 'Your slot is coming up',
    OPEN: 'Open now',
    SLOT_MISSED: 'Slot missed',
    ENDED: 'Closed',
};

export default function StudentDashboard() {
    const { user } = useAuth();
    const [exams, setExams] = useState<AvailableExam[]>([]);
    const [recentResults, setRecentResults] = useState<ResultSummary[]>([]);
    const [stats, setStats] = useState({ open: 0, completed: 0, avgScore: '—' });
    const [loading, setLoading] = useState(true);

    /**
     * The paywall on the dashboard itself.
     *
     * Paying is now part of registration, so an unpaid account is either
     * mid-registration or predates the change. Either way the dashboard has
     * nothing useful to show — every exam is locked — so it shows the one action
     * that matters instead of a grid of disabled cards.
     *
     * `null` while loading: guessing either way produces a visible flash of the
     * wrong state, and guessing "locked" is worse because it flashes a paywall at
     * someone who has already paid.
     */
    const [hasPass, setHasPass] = useState<boolean | null>(null);

    /** Parental consent — prompted, never a wall on the dashboard itself. */
    const [guardianComplete, setGuardianComplete] = useState<boolean | null>(null);

    useEffect(() => {
        api.get('/access-pass/me')
            .then((r) => setHasPass(Boolean(r.data.isActive)))
            // Leave it null on failure. The exam start gate enforces this
            // server-side regardless, so a read error must not lock a paid
            // student out of their own dashboard.
            .catch(() => {});

        api.get('/guardian/me')
            .then((r) => setGuardianComplete(Boolean(r.data.complete)))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const examsRes = await api.get<AvailableExam[]>('/exams/upcoming');
                const list = examsRes.data || [];
                setExams(list);
                setStats((s) => ({ ...s, open: list.filter((e) => e.canStart).length }));
            } catch {
                // Leave the empty state.
            }
            try {
                const resultsRes = await api.get<ResultSummary[]>('/attempts/recent');
                const released = resultsRes.data || [];
                setRecentResults(released);
                const completed = released.length;
                const avg = completed > 0
                    ? Math.round(
                        released.reduce((sum, r) => sum + (r.score / (r.totalMarks || 1)) * 100, 0) / completed,
                    )
                    : 0;
                setStats((s) => ({ ...s, completed, avgScore: completed > 0 ? `${avg}%` : '—' }));
            } catch {
                // Results endpoint optional — leave defaults.
            }
            setLoading(false);
        };
        fetchData();
    }, []);

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container dashboard animate-fade-in">
                <div className="dashboard-header">
                    <div>
                        <h1>Welcome back, {user?.firstName}! 👋</h1>
                        <p className="dashboard-subtitle">
                            Class {user?.classBand}
                            {user?.section ? `-${user.section}` : ''} •{' '}
                            {user?.school?.name || 'Independent Student'}
                        </p>
                    </div>
                    {/* The roll number is what support asks for, so it belongs
                        where a student can read it out without hunting. */}
                    {user?.rollNumber && (
                        <div className="dashboard-roll">
                            <span className="dashboard-roll__label">Roll number</span>
                            <strong className="dashboard-roll__value">{user.rollNumber}</strong>
                        </div>
                    )}
                </div>

                {/* Parental consent — a prompt, not a wall. The exam start gate is
                    the thing that actually enforces it; blocking the dashboard
                    would strand a student who cannot reach their parent today. */}
                {guardianComplete === false && (
                    <div className="notice notice--warn">
                        <div>
                            <strong>One step left: parent or guardian details.</strong>
                            <p>
                                Required before any exam can be started — including the free practice
                                paper. It takes about two minutes.
                            </p>
                        </div>
                        <Link href="/guardian" className="btn btn-primary btn-sm">
                            Complete it now
                        </Link>
                    </div>
                )}

                {hasPass === false ? (
                    /* ── Locked: one payment unlocks the dashboard and every exam ── */
                    <div className="glass-card dashboard-locked">
                        <div className="dashboard-locked__icon" aria-hidden="true">🔒</div>
                        <h2>Your registration isn&apos;t finished yet</h2>
                        <p className="dashboard-locked__lede">
                            One payment completes your registration and unlocks every Olympiad exam on
                            this account. Until then there is nothing here to start.
                        </p>
                        <PaymentTerms compact />
                        <Link href="/unlock" className="btn btn-primary btn-lg">
                            Complete payment and unlock →
                        </Link>
                        <p className="input-hint" style={{ textAlign: 'center' }}>
                            Already paid but still seeing this?{' '}
                            <Link href="/support">Tell us and we will fix it.</Link>
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Stats */}
                        <div className="grid-3 dashboard-stats">
                            <div className="stat-card">
                                <div className="stat-value">{stats.open}</div>
                                <div className="stat-label">Open Now</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{stats.completed}</div>
                                <div className="stat-label">Completed</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{stats.avgScore}</div>
                                <div className="stat-label">Avg Score</div>
                            </div>
                        </div>

                        {/* Exams */}
                        <section className="dashboard-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h2>Your Exams</h2>
                                <Link href="/exams" style={{ fontSize: '0.9rem' }}>View all →</Link>
                            </div>
                            <div className="exam-list">
                                {loading ? (
                                    <div className="loading-container" style={{ minHeight: '120px' }}>
                                        <div className="spinner" />
                                    </div>
                                ) : exams.length > 0 ? (
                                    exams.map((exam) => {
                                        const nextInstance = exam.instances?.[0];
                                        const isCompleted = exam.isCompleted || false;
                                        const startable = !isCompleted && exam.canStart;

                                        return (
                                            <div
                                                key={exam.id}
                                                className="glass-card exam-item"
                                                style={isCompleted ? { filter: 'grayscale(1)', opacity: 0.7 } : {}}
                                            >
                                                <div className="exam-item-info">
                                                    <h3>{exam.title}</h3>
                                                    <div className="exam-meta">
                                                        <span>📅 {nextInstance?.startsAt ? new Date(nextInstance.startsAt).toLocaleDateString() : 'TBD'}</span>
                                                        <span>⏱️ {exam.durationMinutes} min</span>
                                                    </div>
                                                </div>
                                                <div className="exam-item-actions">
                                                    {isCompleted ? (
                                                        <button className="btn btn-secondary btn-sm" disabled style={{ cursor: 'not-allowed' }}>
                                                            ✓ Completed
                                                        </button>
                                                    ) : startable ? (
                                                        <Link href={`/exams/${exam.id}/instructions`} className="btn btn-primary btn-sm">
                                                            Start Exam
                                                        </Link>
                                                    ) : (
                                                        <Link
                                                            href="/exams"
                                                            className="btn btn-secondary btn-sm"
                                                            title={exam.startBlockedReason || undefined}
                                                        >
                                                            {PHASE_LABEL[exam.phase] ?? 'View'}
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="glass-card exam-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
                                        No exams available for your class yet. Check back soon!
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Recent Results */}
                        <section className="dashboard-section">
                            <h2>Recent Results</h2>
                            <div className="exam-list">
                                {loading ? (
                                    <div className="loading-container" style={{ minHeight: '120px' }}>
                                        <div className="spinner" />
                                    </div>
                                ) : recentResults.length > 0 ? (
                                    recentResults.map((result) => (
                                        <div key={result.id} className="glass-card exam-item">
                                            <div className="exam-item-info">
                                                <h3>{result.examTitle}</h3>
                                                <div className="exam-meta">
                                                    <span>📅 {new Date(result.completedAt).toLocaleDateString()}</span>
                                                    {result.rank && <span>🏅 Rank #{result.rank}</span>}
                                                </div>
                                            </div>
                                            <div className="exam-item-actions">
                                                {!result.isDisqualified ? (
                                                    <div className="score-display">
                                                        <span className="score-value">{result.score}</span>
                                                        <span className="score-total">/ {result.totalMarks}</span>
                                                        {/* A provisional score must never be shown as
                                                            if it were final — it can still move. */}
                                                        {result.isProvisional && (
                                                            <span className="score-provisional">Provisional</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="badge badge-warning" style={{ backgroundColor: 'rgba(251, 197, 11, 0.1)', color: 'var(--warning-400)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>Under review</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="glass-card exam-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
                                        No results yet. Complete an exam to see your performance here.
                                    </div>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </main>
        </AuthGuard>
    );
}
