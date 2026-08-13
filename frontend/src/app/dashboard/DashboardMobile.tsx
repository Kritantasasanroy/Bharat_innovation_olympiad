'use client';

import PaymentTerms from '@/components/PaymentTerms';
import Link from 'next/link';
import type { User } from '@/types/user';
import { AvailableExam, GuardianProfile, PHASE_LABEL, ResultSummary, formatDate } from './page';

interface Props {
    user: User | null;
    exams: AvailableExam[];
    recentResults: ResultSummary[];
    stats: { open: number; completed: number; avgScore: string };
    loading: boolean;
    hasPass: boolean | null;
    guardianComplete: boolean | null;
    guardian: GuardianProfile | null;
}

/**
 * The dashboard, as its own mobile screen.
 *
 * Desktop lays this out as a three-column stat grid plus two side-scrolling
 * `exam-item` rows built for a mouse and a wide card. On a phone those rows
 * are the elements that break first (an action button squeezed to the right
 * of a title that has nowhere to wrap to), so this is a stacked, single
 * column pass instead: a data-fetching parent (`page.tsx`) plus a pure
 * render, same as every other mobile screen in this app.
 */
export default function DashboardMobile({
    user, exams, recentResults, stats, loading, hasPass, guardianComplete, guardian,
}: Props) {
    return (
        <main className="mob-page">
            <div className="mob-page__title">Welcome back, {user?.firstName}! 👋</div>
            <p className="mob-page__subtitle">
                Class {user?.classBand}{user?.section ? `-${user.section}` : ''} · {user?.school?.name || 'Independent Participant'}
            </p>

            {user?.rollNumber && (
                <div className="mob-card mob-dash-roll">
                    <span>Roll number</span>
                    <strong>{user.rollNumber}</strong>
                </div>
            )}

            {guardianComplete === false && (
                <div className="mob-card mob-dash-notice">
                    <strong>One step left: parent or guardian details.</strong>
                    <p>Required before any exam can be started, including the free practice paper.</p>
                    <Link href="/guardian" className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '0.6rem' }}>
                        Complete it now
                    </Link>
                </div>
            )}

            {hasPass === false ? (
                <div className="mob-card mob-dash-locked">
                    <div className="mob-dash-locked__icon" aria-hidden="true">🔒</div>
                    <h2>Your registration isn&apos;t finished yet</h2>
                    <p>
                        One payment completes your registration and unlocks every Olympiad exam on
                        this account for the current season.
                    </p>
                    <PaymentTerms compact />
                    <Link href="/unlock" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: '0.8rem' }}>
                        Complete payment and unlock →
                    </Link>
                    <p className="mob-auth__hint" style={{ textAlign: 'center' }}>
                        Already paid but still seeing this? <Link href="/support">Tell us.</Link>
                    </p>
                </div>
            ) : (
                <>
                    <div className="mob-stat-row" data-limon="dashboard-stats">
                        <div className="mob-card">
                            <div className="mob-card__value">{stats.open}</div>
                            <div className="mob-card__label">Open Now</div>
                        </div>
                        <div className="mob-card">
                            <div className="mob-card__value">{stats.completed}</div>
                            <div className="mob-card__label">Completed</div>
                        </div>
                        <div className="mob-card">
                            <div className="mob-card__value">{stats.avgScore}</div>
                            <div className="mob-card__label">Avg Score</div>
                        </div>
                    </div>

                    <section className="mob-section" data-limon="dashboard-exams">
                        <div className="mob-section__head">
                            <h2>Your Exams</h2>
                            <Link href="/exams" style={{ fontSize: '0.8rem' }}>View all →</Link>
                        </div>
                        {loading ? (
                            <div className="loading-container" style={{ minHeight: '100px' }}><div className="spinner" /></div>
                        ) : exams.length > 0 ? (
                            exams.map((exam) => {
                                const nextInstance = exam.instances?.[0];
                                const isCompleted = exam.isCompleted || false;
                                const startable = !isCompleted && exam.canStart;
                                return (
                                    <div key={exam.id} className="mob-card mob-exam-card" style={isCompleted ? { opacity: 0.65 } : {}}>
                                        <h3>{exam.title}</h3>
                                        <div className="mob-exam-card__meta">
                                            <span>📅 {nextInstance?.startsAt ? new Date(nextInstance.startsAt).toLocaleDateString() : 'TBD'}</span>
                                            <span>⏱️ {exam.durationMinutes} min</span>
                                        </div>
                                        {isCompleted ? (
                                            <button className="btn btn-secondary btn-sm" disabled style={{ width: '100%', justifyContent: 'center', marginTop: '0.6rem' }}>
                                                ✓ Completed
                                            </button>
                                        ) : startable ? (
                                            <Link href={`/exams/${exam.id}/instructions`} className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '0.6rem' }}>
                                                Start Exam
                                            </Link>
                                        ) : (
                                            <Link href="/exams" className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '0.6rem' }}>
                                                {PHASE_LABEL[exam.phase] ?? 'View'}
                                            </Link>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="mob-empty">No exams available for your class yet. Check back soon!</div>
                        )}
                    </section>

                    <section className="mob-section">
                        <div className="mob-section__head"><h2>Recent Results</h2></div>
                        {loading ? (
                            <div className="loading-container" style={{ minHeight: '100px' }}><div className="spinner" /></div>
                        ) : recentResults.length > 0 ? (
                            recentResults.map((result) => (
                                <div key={result.id} className="mob-card mob-exam-card">
                                    <h3>{result.examTitle}</h3>
                                    <div className="mob-exam-card__meta">
                                        <span>📅 {new Date(result.completedAt).toLocaleDateString()}</span>
                                        {result.rank && <span>🏅 Rank #{result.rank}</span>}
                                    </div>
                                    {!result.isDisqualified ? (
                                        <div className="score-display" style={{ marginTop: '0.5rem' }}>
                                            <span className="score-value">{result.score}</span>
                                            <span className="score-total">/ {result.totalMarks}</span>
                                            {result.isProvisional && <span className="score-provisional">Provisional</span>}
                                        </div>
                                    ) : (
                                        <span className="badge badge-warning" style={{ backgroundColor: 'rgba(251, 197, 11, 0.1)', color: 'var(--warning-400)', padding: '0.25rem 0.5rem', borderRadius: '4px', display: 'inline-block', marginTop: '0.5rem' }}>Under review</span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="mob-empty">No results yet. Complete an exam to see your performance here.</div>
                        )}
                    </section>

                    {guardian && (
                        <section className="mob-section">
                            <div className="mob-section__head"><h2>Parent / Guardian</h2></div>
                            <div className="mob-card mob-guardian-record">
                                {[
                                    ['Name', `${guardian.guardianFirstName} ${guardian.guardianLastName}`],
                                    ['Relationship', guardian.relationship],
                                    ['Email', guardian.guardianEmail],
                                    ['Mobile', guardian.guardianPhone],
                                    ['Ward date of birth', formatDate(guardian.studentDob)],
                                    ['Ward gender', guardian.gender || '-'],
                                    ['ID document', guardian.idDocumentType || '-'],
                                    ['Consent given', formatDate(guardian.parentalConsentAt)],
                                ].map(([label, value]) => (
                                    <div key={label} className="mob-guardian-record__row">
                                        <span>{label}</span>
                                        <strong>{value}</strong>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                                    {guardian.idDocumentUrl ? (
                                        <a href={guardian.idDocumentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Front ↗</a>
                                    ) : (
                                        <span className="mob-auth__hint">Front not uploaded</span>
                                    )}
                                    {guardian.idDocumentBackUrl ? (
                                        <a href={guardian.idDocumentBackUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Back ↗</a>
                                    ) : (
                                        <span className="mob-auth__hint">Back not uploaded</span>
                                    )}
                                </div>
                                <p className="mob-auth__hint">
                                    Something wrong here? <Link href="/guardian">Update the parent section</Link>.
                                </p>
                            </div>
                        </section>
                    )}
                </>
            )}
        </main>
    );
}
