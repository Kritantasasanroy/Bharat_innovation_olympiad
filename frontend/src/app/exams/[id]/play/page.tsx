'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useExamSession } from '@/hooks/useExamSession';
import { useTimer } from '@/hooks/useTimer';
import { useWebcam } from '@/hooks/useWebcam';
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
        answers, flagged, xpEarned, streak,
        startExam, saveAnswer, submitExam,
        goToQuestion, nextQuestion, prevQuestion, toggleFlag,
    } = useExamSession(id);

    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Connect timer (only after attempt exists)
    const attemptId = attempt?.id || '';
    const { remaining, isExpired } = useTimer(attemptId);

    // Webcam proctoring
    const { videoRef, canvasRef, startWebcam, startProctoring } = useWebcam(attemptId);

    useEffect(() => {
        // Start exam on mount
        startExam().then(() => {
            startWebcam().then(() => startProctoring());
        });
    }, []);

    // Sync selected option when navigating
    useEffect(() => {
        if (currentQuestion) {
            setSelectedOption(answers[currentQuestion.id] || null);
        }
    }, [currentIndex, currentQuestion, answers]);

    const handleSelectOption = (optionId: string) => {
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
        } catch (err) {
            console.error('Submit error:', err);
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
                {/* ── Header ── */}
                <header className="exam-header">
                    <div className="flex items-center gap-4">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>{exam?.title || 'Exam'}</h2>
                        <span className="badge badge-primary">
                            Q {currentIndex + 1} / {questions.length}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
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
                                onClick={() => toggleFlag(currentQuestion.id)}
                            >
                                {flagged.has(currentQuestion.id) ? '🚩 Flagged' : '🏳 Flag'}
                            </button>
                        </div>

                        {/* Question text */}
                        <div className="question-text">
                            <p>{currentQuestion.text}</p>
                        </div>

                        {/* Options */}
                        {currentQuestion.options && (
                            <div className="options-list">
                                {currentQuestion.options.map((opt, i) => (
                                    <div
                                        key={opt.id}
                                        className={`option-item ${selectedOption === opt.id ? 'selected' : ''}`}
                                        onClick={() => handleSelectOption(opt.id)}
                                    >
                                        <div className="option-radio" />
                                        <div className="option-content">
                                            <span className="option-label">
                                                {String.fromCharCode(65 + i)}.
                                            </span>
                                            <span>{opt.text}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Navigation */}
                        <div className="question-nav">
                            <button
                                className="btn btn-secondary"
                                disabled={currentIndex === 0}
                                onClick={prevQuestion}
                            >
                                ← Previous
                            </button>

                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setSelectedOption(null);
                                    if (currentQuestion) saveAnswer(currentQuestion.id, null);
                                }}
                            >
                                Clear
                            </button>

                            {currentIndex < questions.length - 1 ? (
                                <button className="btn btn-primary" onClick={nextQuestion}>
                                    Next →
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowSubmitConfirm(true)}
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
                                onClick={() => goToQuestion(i)}
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

                <style jsx>{`
          .question-container { max-width: 800px; }
          .question-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: var(--space-6);
          }
          .question-text {
            font-size: 1.05rem; line-height: 1.8;
            margin-bottom: var(--space-6);
            padding: var(--space-5);
            background: var(--bg-card);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
          }
          .options-list { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-8); }
          .option-content { display: flex; gap: var(--space-2); }
          .option-label { font-weight: 600; color: var(--text-secondary); min-width: 24px; }
          .question-nav { display: flex; justify-content: space-between; gap: var(--space-3); }
          .progress-section { margin-top: var(--space-8); }
          .sidebar-legend {
            margin-top: var(--space-6);
            display: flex; flex-direction: column; gap: var(--space-2);
            font-size: 0.8rem; color: var(--text-secondary);
          }
          .sidebar-legend div { display: flex; align-items: center; gap: var(--space-2); }
          .legend-dot {
            width: 12px; height: 12px; border-radius: 3px;
            background: var(--bg-card); border: 1px solid var(--border-default);
          }
          .legend-dot.current { background: rgba(59, 130, 246, 0.2); border-color: var(--primary-500); }
          .legend-dot.answered { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); }
          .legend-dot.flagged { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3); }
          .sidebar-submit { width: 100%; margin-top: var(--space-6); }
          .xp-badge {
            display: flex; align-items: center; gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            background: rgba(139, 92, 246, 0.1);
            border: 1px solid rgba(139, 92, 246, 0.2);
            border-radius: var(--radius-full);
            font-size: 0.85rem; font-weight: 600;
            color: var(--accent-400);
          }
          .streak-fire { margin-left: var(--space-1); }
          .webcam-mini {
            position: relative; width: 60px; height: 45px;
            border-radius: var(--radius-sm); overflow: hidden;
            border: 2px solid var(--border-default);
          }
          .webcam-mini video { width: 100%; height: 100%; object-fit: cover; }
          .webcam-mini .webcam-indicator {
            width: 6px; height: 6px; top: 3px; right: 3px;
          }
          .modal-overlay {
            position: fixed; inset: 0; z-index: 100;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center;
          }
          .modal {
            padding: var(--space-8); max-width: 440px; width: 90%;
            text-align: center;
          }
          .modal h2 { margin-bottom: var(--space-4); }
          .modal-actions {
            display: flex; gap: var(--space-4); justify-content: center;
            margin-top: var(--space-6);
          }
        `}</style>
            </div>
        </AuthGuard>
    );
}
