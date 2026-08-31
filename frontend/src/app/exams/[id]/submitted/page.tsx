'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { releaseCamera } from '@/lib/camera';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

/**
 * What a student sees the moment their paper ends.
 *
 * "What to go at the end | score, instructions, verification, result section
 * content."
 *
 * Before this existed, submitting redirected straight into the beta feedback form
 * and then to a results page showing "Results Pending" — so the questions a
 * student actually has at that moment ("did it save?", "when do I find out?",
 * "why is there no score?") were answered nowhere.
 *
 * The order here is the order those questions arrive in: it saved → here is your
 * provisional score → here is what happens next and when → here is how the score
 * is verified → here is where to go.
 */
export default function ExamSubmittedPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const user = useAuthStore((s) => s.user);

    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    /**
     * The exam is over, so the camera goes off — unconditionally, on arrival.
     *
     * The player already stops proctoring when it submits, and `lib/camera.ts`
     * now makes that reach every open stream. This is the backstop: whatever
     * happened during the paper, and by whatever route a student reached this
     * page, nobody sits in front of a live camera light after they have
     * finished. Idempotent, so calling it with nothing running costs nothing.
     */
    useEffect(() => { releaseCamera(); }, []);

    useEffect(() => {
        // The most recent attempt for this exam is the one just submitted.
        api.get('/attempts/results')
            .then(({ data }) => {
                const list = Array.isArray(data) ? data : [];
                setResult(list.find((r: any) => r.examId === id) ?? list[0] ?? null);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    /**
     * The provisional score is shown here as soon as the paper is marked, and
     * does **not** wait for `isReleased`.
     *
     * `isResultReleased` is the switch for the *results page* — the settled,
     * published, rankable result. This page is the other thing: the moment the
     * paper ends, where the first question a student has is "how did I do".
     * Gating it on the same flag meant every beta tester finished their exam and
     * was told "your score is not published yet", which is exactly the screen
     * this page was written to replace.
     *
     * A disqualified attempt still shows nothing — it genuinely carries no score
     * — and the provisional caveat below stays, because the number can still
     * move under review.
     */
    const scoreShown =
        result && !result.isDisqualified && typeof result.score === 'number';

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in" style={{ maxWidth: '760px' }}>
                <div className="submitted-hero">
                    <div className="submitted-hero__tick" aria-hidden="true">✓</div>
                    <h1>Congratulations! Your exam has been submitted</h1>
                    <p>
                        Every answer you gave is saved on our servers. There is nothing more you need
                        to do{user?.rollNumber ? <>, {user.firstName}</> : null}.
                    </p>
                    {user?.rollNumber && (
                        <p className="submitted-hero__roll">
                            Roll number <strong>{user.rollNumber}</strong>
                        </p>
                    )}
                </div>

                {/* ── Score, if any is visible yet ── */}
                <section className="glass-card submitted-card">
                    <h2>Your score</h2>
                    {loading ? (
                        <div className="loading-container" style={{ minHeight: '80px' }}><div className="spinner" /></div>
                    ) : scoreShown ? (
                        <>
                            <div className="submitted-score">
                                <span className="submitted-score__value">
                                    {result.score}
                                </span>
                                <span className="submitted-score__total">/ {result.total}</span>
                            </div>
                            <p className="submitted-provisional">
                                <strong>This is a provisional, unverified score.</strong> It may
                                change while violations and warnings are reviewed by the exam team and grievances are settled.
                            </p>
                        </>
                    ) : result?.isDisqualified ? (
                        <p className="text-muted">
                            {result.disqualificationNote ??
                                'Sorry! This attempt was disqualified after review, so it carries no score.'}
                        </p>
                    ) : (
                        <p className="text-muted">
                            Your score is not published yet. It appears on your results page as soon as
                            marking for this Innovation Olympiad exam is released, you will receive details by email.
                        </p>
                    )}
                </section>

                {/* ── Violations recorded ──
                    "The final submission message should display the user's
                    unverified score along with the total number of violations
                    recorded."

                    Shown whether the number is zero or not, and zero is the
                    point: a student who did nothing wrong should be told so in
                    as many words, because the alternative is finding out weeks
                    later that something was on their record. The count is the
                    same one the counter in the exam header showed. */}
                {!loading && result && typeof result.violationCount === 'number' && (
                    <section className="glass-card submitted-card">
                        <h2>Proctoring record</h2>
                        {result.violationCount === 0 ? (
                            <p className="submitted-violations submitted-violations--clean">
                                <strong>No violations were recorded.</strong> Nothing about your exam
                                has been flagged for review.
                            </p>
                        ) : (
                            <>
                                <p className="submitted-violations submitted-violations--flagged">
                                    <strong>
                                        {result.violationCount} violation
                                        {result.violationCount === 1 ? '' : 's'} recorded.
                                    </strong>{' '}
                                    These are the warnings you saw during the Innovation Olympiad exam: leaving fullscreen,
                                    switching away, a camera or face issue, or a screenshot attempt.
                                </p>
                                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                    A violation is not a decision. Exam team reviews anything serious
                                    before any conclusion is drawn, and most are ordinary
                                    interruptions. If something went wrong during your exam, tell us
                                    from the support page and it will be read alongside this record.
                                </p>
                            </>
                        )}
                    </section>
                )}

                {/* ── What happens next ── */}
                <section className="glass-card submitted-card">
                    <h2>What happens next</h2>
                    <ol className="submitted-steps">
                        <li>
                            <strong>Marking</strong>
                            <p>Your Innovation Olympiad exam is marked automatically as soon as it is submitted.</p>
                        </li>
                        <li>
                            <strong>Verification</strong>
                            <p>
                                Once the exam window closes, every Innovation Olympiad exam goes through fair-score
                                normalisation so students who sat different schedules are compared
                                fairly. All exam violations &amp; warnings are reviewed by the exam team, not
                                by the computer, before anything is concluded from it.
                            </p>
                        </li>
                        <li>
                            <strong>Provisional result</strong>
                            <p>
                                Your score is released first as provisional &amp; unverified. The score is subject to
                                change while exam violations are reviewed and grievances are settled.
                            </p>
                        </li>
                        <li>
                            <strong>Final report</strong>
                            <p>
                                When the season ends we publish your final score, your rank and
                                percentile, your breakdown across the five dimensions, and the answer
                                key with an explanation for every question.
                            </p>
                        </li>
                    </ol>
                </section>

                {/* ── How it is kept fair ── */}
                <section className="glass-card submitted-card">
                    <h2>How your result is verified</h2>
                    <ul className="submitted-list">
                        <li>
                            Everything recorded during your exam is kept with your attempt, so any
                            question about it can be answered from the record/evidence rather than from memory.
                        </li>
                        <li>
                            Nothing is decided automatically. A flagged Innovation Olympiad exam is looked at by the review team,
                            who have to look at evidence and justify actions thereafter.
                        </li>
                        <li>
                            If you think something has gone wrong (a power cut, a connection drop, a
                            score that looks wrong) you can raise it through the support section on the portal and a person will respond.
                        </li>
                    </ul>
                </section>

                <div className="submitted-actions">
                    <Link href="/results" className="btn btn-primary btn-lg">
                        Go to my results
                    </Link>
                    <Link href="/dashboard" className="btn btn-secondary">
                        Back to dashboard
                    </Link>
                    <Link href="/support" className="submitted-actions__support">
                        Something went wrong during my exam
                    </Link>
                </div>
            </main>
        </AuthGuard>
    );
}
