'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
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

    const scoreShown = result && !result.isDisqualified && result.isReleased;

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in" style={{ maxWidth: '760px' }}>
                <div className="submitted-hero">
                    <div className="submitted-hero__tick" aria-hidden="true">✓</div>
                    <h1>Your exam has been submitted</h1>
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
                                <strong>This is a provisional, unverified score.</strong> It can still
                                change while proctoring reviews and grievances are settled.
                            </p>
                        </>
                    ) : (
                        <p className="text-muted">
                            Your score is not published yet. It appears on your results page as soon as
                            marking for this paper is released — we will email you.
                        </p>
                    )}
                </section>

                {/* ── What happens next ── */}
                <section className="glass-card submitted-card">
                    <h2>What happens next</h2>
                    <ol className="submitted-steps">
                        <li>
                            <strong>Marking</strong>
                            <p>Your paper is marked automatically as soon as it is submitted.</p>
                        </li>
                        <li>
                            <strong>Verification</strong>
                            <p>
                                Once the exam window closes, every paper goes through fair-score
                                normalisation so students who sat different sittings are compared
                                fairly. Any paper the proctoring flagged is reviewed by a person — not
                                by the computer — before anything is concluded from it.
                            </p>
                        </li>
                        <li>
                            <strong>Provisional result</strong>
                            <p>
                                Your score is published first as provisional. It is a real score, but
                                it can still move while reviews and grievances are settled.
                            </p>
                        </li>
                        <li>
                            <strong>Final report</strong>
                            <p>
                                When the season closes we publish your final score, your rank and
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
                            question about it can be answered from the record rather than from memory.
                        </li>
                        <li>
                            Nothing is decided automatically. A flagged paper is looked at by a person,
                            who has to write down their reasoning either way.
                        </li>
                        <li>
                            If you think something has gone wrong — a power cut, a connection drop, a
                            score that looks wrong — you can raise it and a person will respond.
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
