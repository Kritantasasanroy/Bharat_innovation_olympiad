'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import LimonTour from '@/components/limon/LimonTour';
import Navbar from '@/components/layout/Navbar';
import PaymentTerms from '@/components/PaymentTerms';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
import api from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import DashboardMobile from './DashboardMobile';

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

/** A stored date, or a placeholder. `en-IN` so it reads the way a parent writes it. */
export function formatDate(value: string | null): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Everything `/guardian/me` returns, minus the audit-only `ipAddress`. */
export interface GuardianProfile {
    guardianFirstName: string;
    guardianLastName: string;
    relationship: string;
    guardianEmail: string;
    guardianPhone: string;
    studentDob: string | null;
    gender: string | null;
    idDocumentType: string | null;
    idDocumentUrl: string | null;
    idDocumentBackUrl: string | null;
    parentalConsentAt: string | null;
    dataConsentAt: string | null;
    consentVersion: string | null;
}

export interface AvailableExam {
    id: string;
    title: string;
    durationMinutes: number;
    phase: Phase;
    canStart: boolean;
    isCompleted?: boolean;
    startBlockedReason?: string | null;
    instances?: ExamInstance[];
}

export interface ResultSummary {
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
export const PHASE_LABEL: Record<Phase, string> = {
    DRAFT: 'Unavailable',
    SCHEDULED: 'Not open yet',
    NEEDS_SLOT: 'Schedule needed',
    SLOT_UPCOMING: 'Your schedule is coming up',
    OPEN: 'Open now',
    SLOT_MISSED: 'Schedule missed',
    ENDED: 'Closed',
};

export default function StudentDashboard() {
    const { user } = useAuth();
    const [exams, setExams] = useState<AvailableExam[]>([]);
    const [recentResults, setRecentResults] = useState<ResultSummary[]>([]);
    const [stats, setStats] = useState({ open: 0, completed: 0, avgScore: '-' });
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
    /**
     * The whole guardian profile, shown back to the student.
     *
     * It was collected and then invisible: the only place any of it appeared was
     * a partial read-only card on `/profile`. A parent who mistyped their own
     * phone number, or picked the wrong relationship, or uploaded the wrong
     * side of a card, had no way to notice — and this is the record that decides
     * whether the student is allowed to sit the exam at all.
     */
    const [guardian, setGuardian] = useState<GuardianProfile | null>(null);

    useEffect(() => {
        api.get('/access-pass/me')
            .then((r) => setHasPass(Boolean(r.data.isActive)))
            // Leave it null on failure. The exam start gate enforces this
            // server-side regardless, so a read error must not lock a paid
            // student out of their own dashboard.
            .catch(() => {});

        api.get('/guardian/me')
            .then((r) => {
                setGuardianComplete(Boolean(r.data.complete));
                setGuardian(r.data.profile ?? null);
            })
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
                setStats((s) => ({ ...s, completed, avgScore: completed > 0 ? `${avg}%` : '-' }));
            } catch {
                // Results endpoint optional — leave defaults.
            }
            setLoading(false);
        };
        fetchData();
    }, []);

    const isMobile = useIsMobile();

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            {/* Limon's tour of the portal, once, on a student's first landing.
                Held until the exam list has loaded: several of its steps point
                at things that are not on the page while it is still a spinner,
                and a step whose target is missing is dropped for good. */}
            <LimonTour tourId="dashboard" ready={!loading} />
            {isMobile ? (
                <DashboardMobile
                    user={user}
                    exams={exams}
                    recentResults={recentResults}
                    stats={stats}
                    loading={loading}
                    hasPass={hasPass}
                    guardianComplete={guardianComplete}
                    guardian={guardian}
                />
            ) : (
            <main className="container dashboard animate-fade-in">
                <div className="dashboard-header">
                    <div>
                        <h1>Welcome back, {user?.firstName}! 👋</h1>
                        <p className="dashboard-subtitle">
                            Class {user?.classBand}
                            {user?.section ? `-${user.section}` : ''} •{' '}
                            {user?.school?.name || 'Independent Participant'}
                        </p>
                    </div>
                    {/* The roll number is what support asks for, so it belongs
                        where a student can read it out without hunting. */}
                    {user?.rollNumber && (
                        <div className="dashboard-roll" data-limon="dashboard-roll">
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
                                Required before any exam can be started, including the free practice
                                Innovation Olympiad exam. It takes about two minutes.
                            </p>
                        </div>
                        <Link href="/guardian" className="btn btn-primary btn-sm">
                            Complete it now
                        </Link>
                    </div>
                )}

                {hasPass === false ? (
                    /* Locked: one payment unlocks the dashboard and every exam for the season */
                    <div className="glass-card dashboard-locked">
                        <div className="dashboard-locked__icon" aria-hidden="true">🔒</div>
                        <h2>Your registration isn&apos;t finished yet</h2>
                        <p className="dashboard-locked__lede">
                            One payment completes your registration and unlocks every Olympiad exam on
                            this account for the current season. Until then there is nothing here to start.
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
                        <div className="grid-3 dashboard-stats" data-limon="dashboard-stats">
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
                        <section className="dashboard-section" data-limon="dashboard-exams">
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
                                        No results yet. Complete an exam, and then verified results are published here
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* ── Parent / guardian record ──
                            Everything the parent submitted, shown back.

                            It was collected and then invisible: a mistyped
                            phone number, the wrong relationship, or a photo of
                            the wrong side of a card could sit unnoticed until it
                            mattered. This is the record that decides whether the
                            student may sit an exam at all, so the student and
                            parent should be able to check it without having to
                            re-open the form. */}
                        {guardian && (
                            <section className="dashboard-section">
                                <h2>Parent / guardian details</h2>
                                <div className="glass-card guardian-record">
                                    <dl className="guardian-record__grid">
                                        <div>
                                            <dt>Name</dt>
                                            <dd>{guardian.guardianFirstName} {guardian.guardianLastName}</dd>
                                        </div>
                                        <div>
                                            <dt>Relationship</dt>
                                            <dd>{guardian.relationship}</dd>
                                        </div>
                                        <div>
                                            <dt>Email</dt>
                                            <dd>{guardian.guardianEmail}</dd>
                                        </div>
                                        <div>
                                            <dt>Mobile</dt>
                                            <dd>{guardian.guardianPhone}</dd>
                                        </div>
                                        <div>
                                            <dt>Ward date of birth</dt>
                                            <dd>{formatDate(guardian.studentDob)}</dd>
                                        </div>
                                        <div>
                                            <dt>Ward gender</dt>
                                            <dd>{guardian.gender || '-'}</dd>
                                        </div>
                                        <div>
                                            <dt>ID document</dt>
                                            <dd>{guardian.idDocumentType || '-'}</dd>
                                        </div>
                                        <div>
                                            <dt>Consent given</dt>
                                            <dd>{formatDate(guardian.parentalConsentAt)}</dd>
                                        </div>
                                    </dl>

                                    {/* Links rather than inline images. This is a
                                        minor's identity document: it should not
                                        render on a dashboard that might be open
                                        on a shared screen or a projector. */}
                                    <div className="guardian-record__docs">
                                        <span className="guardian-record__docs-label">Uploaded ID</span>
                                        {guardian.idDocumentUrl ? (
                                            <a href={guardian.idDocumentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
                                                View front ↗
                                            </a>
                                        ) : (
                                            <span className="guardian-record__missing">Front not uploaded</span>
                                        )}
                                        {guardian.idDocumentBackUrl ? (
                                            <a href={guardian.idDocumentBackUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
                                                View back ↗
                                            </a>
                                        ) : (
                                            <span className="guardian-record__missing">Back not uploaded</span>
                                        )}
                                    </div>

                                    <p className="input-hint">
                                        Something wrong here? <Link href="/guardian">Update the parent section</Link>.
                                        Your consent date is not changed by an edit.
                                    </p>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>
            )}
        </AuthGuard>
    );
}
