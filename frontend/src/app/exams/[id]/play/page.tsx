'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useExamSession } from '@/hooks/useExamSession';
import { useFullscreenMonitor } from '@/hooks/useFullscreenMonitor';
import { useTimer } from '@/hooks/useTimer';
import { useWebcam } from '@/hooks/useWebcam';
import api from '@/lib/api';
import { TIMER_DANGER_THRESHOLD, TIMER_WARNING_THRESHOLD } from '@/lib/constants';
import { use, useEffect, useState } from 'react';

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ExamPlayPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const {
        exam, attempt, questions, currentIndex, currentQuestion,
        answers, flagged, xpEarned, streak, error,
        startExam, saveAnswer, submitExam,
        goToQuestion, nextQuestion, prevQuestion, toggleFlag,
    } = useExamSession(id);

    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pauseReason, setPauseReason] = useState<string>('');

    // Connect timer (only after attempt exists)
    const attemptId = attempt?.id || '';
    const { remaining, isExpired } = useTimer(attemptId);

    // Webcam proctoring
    const { videoRef, canvasRef, startWebcam, startProctoring } = useWebcam(attemptId);

    // Handle auto-submit
    const handleAutoSubmit = async (reason: string) => {
        if (isSubmitting) return;
        
        setIsSubmitting(true);
        try {
            const result = await submitExam();
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

    // Fullscreen monitoring
    const { isPaused, violationCount, isFullscreen } = useFullscreenMonitor({
        onViolation: async (type, count) => {
            console.log(`[Fullscreen] Violation ${count}: ${type}`);
            setPauseReason(type === 'exit_fullscreen' ? 'Fullscreen exited' : 'Tab switched');
            
            // Log violation to backend
            if (attemptId) {
                try {
                    await api.post(`/proctor/events`, {
                        attemptId,
                        type: type === 'exit_fullscreen' ? 'EXIT_FULLSCREEN' : 'TAB_SWITCH',
                        details: { violationCount: count },
                    });
                } catch (err) {
                    console.error('[Fullscreen] Failed to log violation:', err);
                }
            }
        },
        onPause: () => {
            console.log('[Fullscreen] Exam paused');
        },
        onResume: () => {
            console.log('[Fullscreen] Exam resumed');
            setPauseReason('');
        },
        onAutoSubmit: handleAutoSubmit,
        maxViolations: 3,
        pauseTimeoutSec: 20,
    });

    useEffect(() => {
        // Start exam on mount
        startExam()
            .then(() => {
                startWebcam().then(() => startProctoring());
            })
            .catch(console.error);
    }, []);

    // Sync selected option when navigating
    useEffect(() => {
        if (currentQuestion) {
            setSelectedOption(answers[currentQuestion.id] || null);
        }
    }, [currentIndex, currentQuestion, answers]);

    const handleSelectOption = (optionId: string) => {
        if (isPaused) return; // Prevent interaction when paused
        setSelectedOption(optionId);
        if (currentQuestion) {
            saveAnswer(currentQuestion.id, optionId);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const result = await submitExam();
            if (result?.redirectUrl) {
                window.location.href = result.redirectUrl;
            } else {
                window.location.href = '/results';
            }
        } catch (err: any) {
            console.error('Submit error:', err);
            // If already submitted or other error, redirect so user is not stuck
            window.location.href = '/results';
        } finally {
            setIsSubmitting(false);
        }
    };

    // Timer classes
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
                {/* ── Pause Overlay ── */}
                {isPaused && (
                    <div className="pause-overlay" style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <div className="pause-modal glass-card" style={{ textAlign: 'center', padding: '2rem' }}>
                            <h2>⚠️ Exam Paused</h2>
                            <p>{pauseReason}</p>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                Click the button below to return to fullscreen and resume.
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--warning-400)', marginTop: '12px' }}>
                                Violations: {violationCount} / 3
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--danger-400)' }}>
                                Exam will auto-submit if paused for more than 20 seconds.
                            </p>
                            <button 
                                className="btn btn-primary" 
                                style={{ marginTop: '1rem' }}
                                onClick={() => {
                                    const elem = document.documentElement;
                                    if (elem.requestFullscreen) {
                                        elem.requestFullscreen();
                                    }
                                }}
                            >
                                Resume Exam
                            </button>
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
                        {/* Violation Counter */}
                        {violationCount > 0 && (
                            <div className="violation-badge">
                                ⚠️ {violationCount} / 3
                            </div>
                        )}

                        {/* XP Badge */}
                        <div className="xp-badge">
                            ⚡ {xpEarned} XP
                            {streak >= 3 && <span className="streak-fire">🔥 {streak}</span>}
                        </div>

                        {/* Overall Timer */}
                        <div className={`timer-display ${timerClass}`}>
                            ⏱ {formatTime(remaining)}
                        </div>

                        {/* Webcam Mini */}
                        <div className="webcam-mini">
                            <video ref={videoRef} autoPlay muted playsInline />
                            <div className="webcam-indicator" />
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                        </div>
                    </div>
                </header>

                {/* ── Main Question Area ── */}
                <main className="exam-main">
                    <div className="question-container animate-fade-in" key={currentQuestion.id}>
                        {/* Question header */}
                        <div className="question-header">
                            <div className="flex items-center gap-3">
                                <span className="badge badge-primary">{currentQuestion.type}</span>
                                <span className={`badge ${currentQuestion.difficulty === 'EASY' ? 'badge-success' :
                                    currentQuestion.difficulty === 'MEDIUM' ? 'badge-warning' : 'badge-danger'
                                    }`}>
                                    {currentQuestion.difficulty}
                                </span>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}
                                    {currentQuestion.negativeMarks > 0 && ` (-${currentQuestion.negativeMarks})`}
                                </span>
                            </div>

                            <button
                                className={`btn btn-sm ${flagged.has(currentQuestion.id) ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => !isPaused && toggleFlag(currentQuestion.id)}
                                disabled={isPaused}
                            >
                                {flagged.has(currentQuestion.id) ? '🚩 Flagged' : '🏳 Flag'}
                            </button>
                        </div>

                        {/* Question text and media */}
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

                        {/* Options */}
                        {currentQuestion.options && (
                            <div className="options-list">
                                {currentQuestion.options.map((opt, i) => {
                                    const optId = opt.id || i.toString();
                                    return (
                                        <div
                                            key={optId}
                                            className={`option-item ${selectedOption === optId ? 'selected' : ''} ${isPaused ? 'disabled' : ''}`}
                                            onClick={() => handleSelectOption(optId)}
                                        >
                                            <div className="option-radio" />
                                            <div className="option-content">
                                                <span className="option-label">
                                                    {String.fromCharCode(65 + i)}.
                                                </span>
                                                <span>{opt.text}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Navigation */}
                        <div className="question-nav">
                            <button
                                className="btn btn-secondary"
                                disabled={currentIndex === 0 || isPaused}
                                onClick={prevQuestion}
                            >
                                ← Previous
                            </button>

                            <button
                                className="btn btn-secondary"
                                disabled={isPaused}
                                onClick={() => {
                                    setSelectedOption(null);
                                    if (currentQuestion) saveAnswer(currentQuestion.id, null);
                                }}
                            >
                                Clear
                            </button>

                            {currentIndex < questions.length - 1 ? (
                                <button 
                                    className="btn btn-primary" 
                                    onClick={nextQuestion}
                                    disabled={isPaused}
                                >
                                    Next →
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowSubmitConfirm(true)}
                                    disabled={isPaused}
                                >
                                    Submit Exam ✓
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
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

                {/* ── Sidebar — Question Index ── */}
                <aside className="exam-sidebar">
                    <h3 style={{ fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>Questions</h3>
                    <div className="question-index-grid">
                        {questions.map((q, i) => (
                            <button
                                key={q.id}
                                className={`question-index-item ${i === currentIndex ? 'current' :
                                    answers[q.id] ? 'answered' :
                                        flagged.has(q.id) ? 'flagged' : ''
                                    }`}
                                onClick={() => !isPaused && goToQuestion(i)}
                                disabled={isPaused}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <div className="sidebar-legend">
                        <div><span className="legend-dot current" /> Current</div>
                        <div><span className="legend-dot answered" /> Answered</div>
                        <div><span className="legend-dot flagged" /> Flagged</div>
                        <div><span className="legend-dot" /> Not Visited</div>
                    </div>

                    <button
                        className="btn btn-danger btn-lg sidebar-submit"
                        onClick={() => setShowSubmitConfirm(true)}
                        disabled={isPaused}
                    >
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
                                    <span style={{ color: 'var(--warning-400)' }}>
                                        {' '}({questions.length - answeredCount} unanswered)
                                    </span>
                                )}
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                This action cannot be undone.
                            </p>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" onClick={() => setShowSubmitConfirm(false)}>
                                    Go Back
                                </button>
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
