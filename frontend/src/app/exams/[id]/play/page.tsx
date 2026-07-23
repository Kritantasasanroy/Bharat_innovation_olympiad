'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useExamSession } from '@/hooks/useExamSession';
import { useFaceProctor, NO_FACE_SUSTAIN_MS, LOOKING_AWAY_SUSTAIN_MS, FACE_MISMATCH_SUSTAIN_MS } from '@/hooks/useFaceProctor';
import { useFullscreenMonitor } from '@/hooks/useFullscreenMonitor';
import { useTimer } from '@/hooks/useTimer';
import api from '@/lib/api';
import { TIMER_DANGER_THRESHOLD, TIMER_WARNING_THRESHOLD } from '@/lib/constants';
import { use, useEffect, useRef, useState } from 'react';

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ExamPlayPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const {
        exam, attempt, questions, currentIndex, currentQuestion,
        answers, flagged, error,
        startExam, saveAnswer, submitExam,
        goToQuestion, nextQuestion, prevQuestion, toggleFlag,
    } = useExamSession(id);

    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const attemptId = attempt?.id || '';
    const { remaining } = useTimer(attemptId);

    // Latest-ref for submit so the auto-submit callback (registered once with
    // empty deps in the fullscreen hook) always calls the freshest version.
    const submitExamRef = useRef(submitExam);
    useEffect(() => { submitExamRef.current = submitExam; });

    // handleAutoSubmit needs stopProctoring (from useFaceProctor, declared
    // below) and useFullscreenMonitor needs handleAutoSubmit — a genuine
    // circular dependency between the two hooks. Break it with a ref: define
    // the callback body now, referencing stopProctoring via a ref that gets
    // populated once useFaceProctor is called further down.
    const stopProctoringRef = useRef<(() => void) | null>(null);
    const handleAutoSubmit = async (reason: string) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        stopProctoringRef.current?.();
        try { sessionStorage.removeItem(`violations_${window.location.pathname}`); } catch { /* ignore */ }
        try {
            const result = await submitExamRef.current();
            alert(`Exam auto-submitted: ${reason}`);
            if (result?.redirectUrl) {
                window.location.href = result.redirectUrl;
            } else {
                window.location.href = '/results';
            }
        } catch (err) {
            console.error('Auto-submit error:', err);
        }
    };

    const {
        isFullscreen, violationCount, isGated, lastError, maxViolations, requestFullscreen,
        reportExternalViolation,
    } = useFullscreenMonitor({
        onViolation: async (type, count) => {
            if (!attemptId) return;
            // Face-related violations are already logged by useFaceProctor's
            // own postEvent calls — only fullscreen-related violations need a
            // separate ProctorEvent posted here.
            if (type === 'no_face' || type === 'looking_away' || type === 'face_mismatch' || type === 'multiple_faces') return;
            try {
                const backendType =
                    type === 'exit_fullscreen' ? 'EXIT_FULLSCREEN'
                    : type === 'tab_switch'     ? 'TAB_SWITCH'
                    :                              'WINDOW_BLUR';
                await api.post('/proctor/events', {
                    attemptId,
                    type: backendType,
                    details: { violationCount: count, source: type },
                });
            } catch { /* best-effort */ }
        },
        onAutoSubmit: handleAutoSubmit,
        maxViolations: 3,
        pauseTimeoutSec: 20,
    });

    const {
        videoRef,
        isLoaded: faceModelsLoaded,
        loadingProgress,
        currentFaceCount,
        isIdentityVerified,
        noFaceSince,
        awaySince,
        mismatchSince,
        startProctoring,
        stopProctoring,
    } = useFaceProctor({
        attemptId,
        onSustainedViolation: (type) => reportExternalViolation(
            type === 'NO_FACE' ? 'no_face' : type === 'LOOKING_AWAY' ? 'looking_away' : 'face_mismatch',
        ),
        onInstantViolation: () => reportExternalViolation('multiple_faces'),
    });

    useEffect(() => { stopProctoringRef.current = stopProctoring; });

    // Live "now" tick so the face/gaze popup countdowns re-render every 0.5s.
    const [nowTick, setNowTick] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNowTick(Date.now()), 500);
        return () => clearInterval(t);
    }, []);
    const noFaceSecondsLeft = noFaceSince ? Math.max(0, Math.ceil((NO_FACE_SUSTAIN_MS - (nowTick - noFaceSince)) / 1000)) : null;
    const awaySecondsLeft = awaySince ? Math.max(0, Math.ceil((LOOKING_AWAY_SUSTAIN_MS - (nowTick - awaySince)) / 1000)) : null;
    const mismatchSecondsLeft = mismatchSince ? Math.max(0, Math.ceil((FACE_MISMATCH_SUSTAIN_MS - (nowTick - mismatchSince)) / 1000)) : null;
    const isMultiFace = currentFaceCount > 1;

    // Center-screen popups, dismissed via an OK button. Each type tracks WHICH
    // episode was last dismissed (its "since" timestamp) so a fresh episode of
    // the same issue shows the popup again instead of staying dismissed forever.
    const [noFaceDismissedAt, setNoFaceDismissedAt] = useState<number | null>(null);
    const [awayDismissedAt, setAwayDismissedAt] = useState<number | null>(null);
    const [mismatchDismissedAt, setMismatchDismissedAt] = useState<number | null>(null);
    const [multiFaceDismissed, setMultiFaceDismissed] = useState(false);
    useEffect(() => { if (!isMultiFace) setMultiFaceDismissed(false); }, [isMultiFace]);

    // Only one popup on screen at a time — priority order below.
    type FaceIssue = { key: string; icon: string; title: string; message: string; onOk: () => void };
    const faceIssue: FaceIssue | null =
        isMultiFace && !multiFaceDismissed ? {
            key: 'multiface', icon: '👥', title: 'Multiple Faces Detected',
            message: 'Only the registered student should be visible in the camera. Please make sure no one else is in frame.',
            onOk: () => setMultiFaceDismissed(true),
        }
        : noFaceSince !== null && noFaceSince !== noFaceDismissedAt ? {
            key: 'no-face', icon: '👤', title: 'Face Not Detected',
            message: `Please be clearly visible in the camera${noFaceSecondsLeft && noFaceSecondsLeft > 0 ? ` within ${noFaceSecondsLeft}s` : ''}.`,
            onOk: () => setNoFaceDismissedAt(noFaceSince),
        }
        : mismatchSince !== null && mismatchSince !== mismatchDismissedAt ? {
            key: 'mismatch', icon: '⚠️', title: 'Identity Mismatch',
            message: 'Face does not match your enrolled profile. Please ensure you are the registered student.',
            onOk: () => setMismatchDismissedAt(mismatchSince),
        }
        : awaySince !== null && awaySince !== awayDismissedAt ? {
            key: 'looking-away', icon: '👀', title: 'Looking Away',
            message: `Please look at the screen${awaySecondsLeft && awaySecondsLeft > 0 ? ` within ${awaySecondsLeft}s` : ''}.`,
            onOk: () => setAwayDismissedAt(awaySince),
        }
        : null;

    const [showViolationInfo, setShowViolationInfo] = useState(false);

    // Start the exam once on mount.
    useEffect(() => {
        startExam().catch(err => console.warn('Exam init warning:', err));
    }, []);

    // Start face-api.js proctoring only once the real attemptId is available.
    // (attemptId is '' during the initial render, before startExam() resolves —
    // calling startProctoring() from the mount effect above captured that stale
    // '' via closure, so every detection event was posted with attemptId: '' and
    // silently failed a foreign-key constraint server-side.)
    useEffect(() => {
        if (!attemptId) return;
        startProctoring();
        return () => { stopProctoring(); };
    }, [attemptId]);

    useEffect(() => {
        if (currentQuestion) {
            setSelectedOption(answers[currentQuestion.id] || null);
        }
    }, [currentIndex, currentQuestion, answers]);

    const handleSelectOption = (optionId: string) => {
        if (isGated) return;
        setSelectedOption(optionId);
        if (currentQuestion) {
            saveAnswer(currentQuestion.id, optionId);
        }
    };

    const clearViolationStorage = () => {
        try { sessionStorage.removeItem(`violations_${window.location.pathname}`); } catch { /* ignore */ }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        stopProctoring();
        clearViolationStorage();
        try {
            const result = await submitExam();
            if (result?.redirectUrl) {
                window.location.href = result.redirectUrl;
            } else {
                window.location.href = '/results';
            }
        } catch {
            window.location.href = '/results';
        } finally {
            setIsSubmitting(false);
        }
    };

    const timerClass = remaining <= TIMER_DANGER_THRESHOLD
        ? 'timer-danger' : remaining <= TIMER_WARNING_THRESHOLD
            ? 'timer-warning' : '';

    const answeredCount = Object.keys(answers).length;
    const progressPercent = questions.length > 0
        ? Math.round((answeredCount / questions.length) * 100) : 0;

    if (error === 'FACE_ENROLLMENT_REQUIRED') {
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '500px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🪪</div>
                    <h2 style={{ marginBottom: '1rem' }}>Face Enrollment Required</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        This is a proctored exam — you need to enroll your face before you can start it. It only takes a few seconds.
                    </p>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => window.location.href = '/profile'}>
                        Enroll Face Now
                    </button>
                </div>
            </div>
        );
    }

    if (error === 'ACCESS_PASS_REQUIRED') {
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '500px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h2 style={{ marginBottom: '1rem' }}>Exam Access Locked</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Your exam access pass is not active yet. One payment unlocks every olympiad
                        exam — the practice paper stays free.
                    </p>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => window.location.href = '/unlock'}>
                        Unlock All Exams
                    </button>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '500px' }}>
                    <h2 style={{ color: 'var(--danger-400)', marginBottom: '1rem' }}>Failed to Load Exam</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => window.location.href = '/dashboard'}>
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (!currentQuestion) {
        return (
            <div className="loading-container">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <div className="exam-player">

                {/* ── face-api.js model loading banner — shown only during first load (~3s) ── */}
                {!faceModelsLoaded && loadingProgress && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 9998,
                        background: 'rgba(14,165,233,0.10)', borderBottom: '1px solid rgba(14,165,233,0.25)',
                        padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}>
                        <div style={{ width: '16px', height: '16px', border: '2px solid rgba(14,165,233,0.4)', borderTopColor: 'var(--primary-400)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{loadingProgress}</span>
                    </div>
                )}

                {/* ── Face-check popup — center-screen, dismissed via OK button ── */}
                {faceIssue && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.75)', zIndex: 9996,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem', maxWidth: '420px', width: '90%' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{faceIssue.icon}</div>
                            <h2 style={{ marginBottom: '0.75rem' }}>{faceIssue.title}</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{faceIssue.message}</p>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                onClick={faceIssue.onOk}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Fullscreen Gate Overlay ──
                    Shown on initial load (page refresh) and after every fullscreen violation.
                    The user MUST click the button to enter fullscreen — this is the only
                    way to dismiss it and interact with the exam. */}
                {isGated && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.92)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem', maxWidth: '460px', width: '90%' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🖥️</div>
                            <h2 style={{ marginBottom: '0.75rem' }}>
                                {violationCount === 0 ? 'Fullscreen Required' : isFullscreen ? 'Exam Paused' : 'Return to Fullscreen'}
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                {violationCount === 0
                                    ? 'This exam must be taken in fullscreen mode. Click below to begin — your camera will activate automatically.'
                                    : isFullscreen
                                        ? `Violation ${violationCount} of ${maxViolations} recorded. Click below to resume your exam.`
                                        : `Violation ${violationCount} of ${maxViolations} — re-enter fullscreen to continue your exam.`}
                            </p>
                            {violationCount > 0 && (
                                <p style={{ color: 'var(--danger-400)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                                    Exam will auto-submit if fullscreen is not restored within 20 seconds.
                                </p>
                            )}
                            {violationCount >= maxViolations - 1 && violationCount < maxViolations && (
                                <p style={{ color: 'var(--warning-400)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                                    ⚠️ One more violation will auto-submit your exam.
                                </p>
                            )}
                            {lastError && (
                                <p style={{ color: 'var(--danger-400)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
                                    {lastError}
                                </p>
                            )}
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ marginTop: '1.25rem', width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                onClick={requestFullscreen}
                            >
                                {violationCount === 0 ? '▶ Enter Fullscreen & Start' : isFullscreen ? '▶ Resume Exam' : '↩ Re-enter Fullscreen'}
                            </button>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                                Do not switch tabs, minimise, or open other apps during the exam.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Header ── */}
                <header className="exam-header">
                    <div className="flex items-center gap-4">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>{exam?.title || 'Exam'}</h2>
                        <span className="badge badge-primary">
                            Q {currentIndex + 1} / {questions.length}
                        </span>
                        {!isFullscreen && (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                                ⚠️ Not Fullscreen
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Always-visible violation counter so the student knows the score */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <div
                                className="violation-badge"
                                style={{
                                    color: violationCount === 0 ? 'var(--text-secondary)' : 'var(--danger-400)',
                                    background: violationCount === 0 ? 'rgba(148,163,184,0.08)' : 'rgba(239,68,68,0.1)',
                                    borderColor: violationCount === 0 ? 'var(--border-subtle)' : 'rgba(239,68,68,0.3)',
                                }}
                            >
                                ⚠️ {violationCount} / {maxViolations}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowViolationInfo((v) => !v)}
                                onMouseEnter={() => setShowViolationInfo(true)}
                                onMouseLeave={() => setShowViolationInfo(false)}
                                aria-label="What counts as a violation?"
                                style={{
                                    width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                                    border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
                                    color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                }}
                            >
                                i
                            </button>
                            {showViolationInfo && (
                                <div style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', zIndex: 100,
                                    width: '260px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                                    borderRadius: '10px', padding: '0.85rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                                    fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                                }}>
                                    Violations are recorded when exam integrity rules are broken — for example leaving fullscreen, switching tabs, or camera/face issues.
                                    After {maxViolations} violations, your exam will be automatically submitted. Please follow all on-screen instructions carefully throughout the exam.
                                </div>
                            )}
                        </div>
                        <div className={`timer-display ${timerClass}`}>
                            ⏱ {formatTime(remaining)}
                        </div>
                        {/* Face detection status indicators */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {/* Face count dot */}
                            <div
                                title={
                                    !faceModelsLoaded ? 'Loading AI models…'
                                    : currentFaceCount === 0 ? 'No face detected'
                                    : currentFaceCount === 1 ? 'Face detected'
                                    : `${currentFaceCount} faces detected!`
                                }
                                style={{
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: !faceModelsLoaded ? 'var(--text-muted)'
                                        : currentFaceCount === 1 ? '#22c55e'
                                        : currentFaceCount === 0 ? '#ef4444'
                                        : '#f97316',
                                    flexShrink: 0,
                                }}
                            />
                            {/* Identity badge */}
                            {isIdentityVerified === false && (
                                <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 600 }}>ID?</span>
                            )}
                        </div>
                        {/* Webcam preview (hidden, face-api.js uses it internally) */}
                        <div className="webcam-mini" title="Camera preview">
                            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div className="webcam-indicator" style={{ background: faceModelsLoaded && currentFaceCount === 1 ? '#22c55e' : faceModelsLoaded && currentFaceCount === 0 ? '#ef4444' : undefined }} />
                        </div>
                    </div>
                </header>

                {/* ── Main Question Area ── */}
                <main className="exam-main">
                    <div className="question-container animate-fade-in" key={currentQuestion.id}>
                        <div className="question-header">
                            <div />
                            <button
                                className={`btn btn-sm ${flagged.has(currentQuestion.id) ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => !isGated && toggleFlag(currentQuestion.id)}
                                disabled={isGated}
                            >
                                {flagged.has(currentQuestion.id) ? '🔖 Marked for later' : '🔖 Mark for later'}
                            </button>
                        </div>

                        <div className="question-text">
                            <p>{currentQuestion.text}</p>

                            {/* A question can carry a picture AND a video at once, so these
                                are independent slots rather than one switched-on media type. */}
                            {currentQuestion.imageUrl && (
                                <img
                                    src={currentQuestion.imageUrl}
                                    alt="Question illustration"
                                    className="question-media"
                                />
                            )}
                            {currentQuestion.videoUrl && (
                                <video
                                    src={currentQuestion.videoUrl}
                                    controls
                                    // No autoplay: a video starting on its own during a timed
                                    // exam is startling, and several questions may carry one.
                                    preload="metadata"
                                    className="question-media"
                                />
                            )}

                            {/* Legacy single-media questions authored before the split. */}
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'IMAGE' && (
                                <img src={currentQuestion.mediaUrl} alt="Question Media" className="question-media" />
                            )}
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'VIDEO' && (
                                <video src={currentQuestion.mediaUrl} controls preload="metadata" className="question-media" />
                            )}
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'AUDIO' && (
                                <audio src={currentQuestion.mediaUrl} controls style={{ width: '100%', marginTop: '1rem' }} />
                            )}
                        </div>

                        {currentQuestion.options && (
                            <div className="options-list">
                                {currentQuestion.options.map((opt, i) => {
                                    const optId = opt.id || i.toString();
                                    return (
                                        <div
                                            key={optId}
                                            className={`option-item ${selectedOption === optId ? 'selected' : ''} ${isGated ? 'disabled' : ''}`}
                                            onClick={() => handleSelectOption(optId)}
                                        >
                                            <div className="option-radio" />
                                            <div className="option-content">
                                                <span className="option-label">{String.fromCharCode(65 + i)}.</span>
                                                <span>{opt.text}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="question-nav">
                            <button className="btn btn-secondary" disabled={currentIndex === 0 || isGated} onClick={prevQuestion}>← Previous</button>
                            <button className="btn btn-secondary" disabled={isGated} onClick={() => { setSelectedOption(null); if (currentQuestion) saveAnswer(currentQuestion.id, null); }}>Clear</button>
                            {currentIndex < questions.length - 1 ? (
                                <button className="btn btn-primary" onClick={nextQuestion} disabled={isGated}>Next →</button>
                            ) : (
                                <button className="btn btn-primary" onClick={() => setShowSubmitConfirm(true)} disabled={isGated}>Submit Exam ✓</button>
                            )}
                        </div>
                    </div>

                    <div className="progress-section">
                        <div className="flex justify-between" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            <span>{answeredCount} of {questions.length} answered</span>
                            <span>{progressPercent}%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>
                </main>

                {/* ── Sidebar ── */}
                <aside className="exam-sidebar">
                    <h3 style={{ fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>Questions</h3>
                    <div className="question-index-grid">
                        {questions.map((q, i) => (
                            <button
                                key={q.id}
                                className={`question-index-item ${i === currentIndex ? 'current' : answers[q.id] ? 'answered' : flagged.has(q.id) ? 'flagged' : ''}`}
                                onClick={() => !isGated && goToQuestion(i)}
                                disabled={isGated}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <div className="sidebar-legend">
                        <div><span className="legend-dot current" /> Current</div>
                        <div><span className="legend-dot answered" /> Answered</div>
                        <div><span className="legend-dot flagged" /> Marked for later</div>
                        <div><span className="legend-dot" /> Not Visited</div>
                    </div>

                    <button className="btn btn-danger btn-lg sidebar-submit" onClick={() => setShowSubmitConfirm(true)} disabled={isGated}>
                        Submit Exam
                    </button>
                </aside>

                {/* ── Submit Confirmation Modal ── */}
                {showSubmitConfirm && (
                    <div className="modal-overlay">
                        <div className="modal glass-card">
                            <h2>Submit Exam?</h2>
                            <p>
                                You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
                                {answeredCount < questions.length && (
                                    <span style={{ color: 'var(--warning-400)' }}> ({questions.length - answeredCount} unanswered)</span>
                                )}
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>This action cannot be undone.</p>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" onClick={() => setShowSubmitConfirm(false)}>Go Back</button>
                                <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? 'Submitting...' : 'Confirm Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
