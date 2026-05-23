'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useExamSession } from '@/hooks/useExamSession';
import { useFullscreenMonitor } from '@/hooks/useFullscreenMonitor';
import { useTimer } from '@/hooks/useTimer';
import { useWebcam } from '@/hooks/useWebcam';
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
    const { videoRef, canvasRef, startWebcam, startProctoring } = useWebcam(attemptId);

    // Latest-ref for submit so the auto-submit callback (registered once with
    // empty deps in the fullscreen hook) always calls the freshest version.
    const submitExamRef = useRef(submitExam);
    useEffect(() => { submitExamRef.current = submitExam; });

    const handleAutoSubmit = async (reason: string) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
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
    } = useFullscreenMonitor({
        onViolation: async (type, count) => {
            if (!attemptId) return;
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

    // Kick off the exam once on mount; start webcam + proctoring as soon as
    // the attempt is created so the camera is live from the very first frame.
    useEffect(() => {
        startExam()
            .then(() => {
                startWebcam().then((stream) => {
                    if (stream) startProctoring();
                });
            })
            .catch(err => console.warn('Exam init warning:', err));
    }, []);

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
                        <div
                            className="violation-badge"
                            style={{
                                color: violationCount === 0 ? 'var(--text-secondary)' : 'var(--danger-400)',
                                background: violationCount === 0 ? 'rgba(148,163,184,0.08)' : 'rgba(239,68,68,0.1)',
                                borderColor: violationCount === 0 ? 'var(--border-subtle)' : 'rgba(239,68,68,0.3)',
                            }}
                            title="Violations: leaving fullscreen, switching tabs, or losing focus all count toward this limit"
                        >
                            ⚠️ {violationCount} / {maxViolations}
                        </div>
                        <div className={`timer-display ${timerClass}`}>
                            ⏱ {formatTime(remaining)}
                        </div>
                        <div className="webcam-mini" title="Live proctoring feed">
                            <video ref={videoRef} autoPlay muted playsInline />
                            <div className="webcam-indicator" />
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
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
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'IMAGE' && (
                                <img src={currentQuestion.mediaUrl} alt="Question Media" style={{ maxWidth: '100%', maxHeight: '400px', marginTop: '1rem', borderRadius: 'var(--radius-md)' }} />
                            )}
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'VIDEO' && (
                                <video src={currentQuestion.mediaUrl} controls style={{ maxWidth: '100%', maxHeight: '400px', marginTop: '1rem', borderRadius: 'var(--radius-md)' }} />
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
