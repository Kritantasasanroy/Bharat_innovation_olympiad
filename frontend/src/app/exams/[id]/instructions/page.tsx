'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useDeviceCheck } from '@/hooks/useDeviceCheck';
import { useWebcam } from '@/hooks/useWebcam';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

/**
 * Shared between the Rules & Guidelines card and the Start Exam confirmation
 * modal.
 *
 * Takes the exam so the marking rule can tell the truth: the negative-marking
 * line was hard-coded and stayed on screen even for papers that carry none,
 * which is a rule students would reasonably change their strategy over.
 */
function buildRules(exam: { negativeMarking?: boolean; sectionCount?: number } | null) {
    return [
        <>The exam must be taken in <strong>fullscreen mode</strong>.</>,
        <>Your webcam must remain on throughout the exam for AI proctoring — stay visible and look at the screen.</>,
        <>Your background must be <strong>plain and a solid colour</strong>. Cluttered, busy, or changing backgrounds can make AI proctoring fail to verify you — this may result in disqualification.</>,
        <>Exiting fullscreen or switching tabs will pause the exam.</>,
        <>If paused for more than 20 seconds, the exam will auto-submit.</>,
        <>Violations are recorded for actions that break exam integrity rules — including leaving fullscreen, switching tabs, or camera/face issues. After 3 violations, the exam auto-submits.</>,
        ...(exam?.sectionCount && exam.sectionCount > 1
            ? [
                  <>
                      The paper is divided into <strong>{exam.sectionCount} sections</strong>. You will
                      work through one section at a time, and you can move freely between questions.
                  </>,
              ]
            : []),
        <>Your answers are auto-saved continuously.</>,
        exam?.negativeMarking
            ? <>Negative marking applies for incorrect MCQ answers.</>
            : <>There is <strong>no negative marking</strong> — an incorrect answer costs you nothing, so attempt every question.</>,
        <>Use the Submit button when done — do not close the browser.</>,
    ];
}

export default function ExamInstructionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { deviceChecks, allChecksPassed } = useDeviceCheck();
    const { videoRef, startWebcam } = useWebcam();
    const router = useRouter();
    const [webcamStarted, setWebcamStarted] = useState(false);
    const [webcamLoading, setWebcamLoading] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    /**
     * The rules acknowledgement. Previously a plain "I Understand, Start Exam"
     * button, which is one click away from being dismissed unread; a checkbox
     * makes the acknowledgement a deliberate, separate act from starting.
     * Reset whenever the modal closes so it is never pre-ticked on reopen.
     */
    const [rulesAccepted, setRulesAccepted] = useState(false);

    // The paper itself — needed for the marking rule, the section count, and
    // whether this exam gates on the trial.
    const [exam, setExam] = useState<any>(null);

    /**
     * Rehearsal gate. The server refuses to start a real exam until the trial
     * paper has been sat (`TRIAL_REQUIRED`), so resolve that here and send the
     * student to the trial first rather than letting them finish every device
     * check and then be turned away by the player.
     */
    const [trialState, setTrialState] = useState<'checking' | 'required' | 'done' | 'not_needed'>('checking');
    const [trialExamId, setTrialExamId] = useState<string | null>(null);

    // Face ID enrollment gate — must be enrolled before Start Exam is enabled.
    const [faceEnrollStatus, setFaceEnrollStatus] = useState<'checking' | 'enrolled' | 'not_enrolled'>('checking');
    const [faceMsg, setFaceMsg] = useState('');
    const [faceCapturing, setFaceCapturing] = useState(false);
    const {
        videoRef: faceVideoRef,
        isLoaded: faceModelsLoaded,
        loadingProgress: faceLoadingProgress,
        startEnrollmentCamera,
        captureDescriptor,
        enrollFace,
    } = useFaceProctor({ attemptId: 'device-check', disabled: false });

    useEffect(() => {
        api.get('/proctor/enrollment')
            .then((r) => setFaceEnrollStatus(r.data.enrolled ? 'enrolled' : 'not_enrolled'))
            .catch(() => setFaceEnrollStatus('not_enrolled'));
    }, []);

    // Exam access pass — the server refuses to start an exam without one, so
    // surface it here rather than letting the student finish every device
    // check only to be turned away by the player. `requiredForExam` keeps the
    // free practice paper from showing a lock it will never hit.
    const [passStatus, setPassStatus] = useState<'checking' | 'active' | 'locked'>('checking');
    useEffect(() => {
        api.get('/access-pass/me', { params: { examId: id } })
            .then((r) => {
                const needsPass = r.data.requiredForExam !== false;
                setPassStatus(!needsPass || r.data.isActive ? 'active' : 'locked');
            })
            .catch(() => setPassStatus('locked'));
    }, [id]);

    /**
     * Resolve the exam and, if it gates on the rehearsal, whether this student
     * has already sat it. `?trial=done` is a hint from the trial player that we
     * have just come back from it — the authoritative answer is still the
     * server's, so it only shortcuts the optimistic state.
     */
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { data } = await api.get(`/exams/${id}`);
                if (cancelled) return;
                setExam(data);

                if (data.isTrial || data.requiresTrial === false) {
                    setTrialState('not_needed');
                    return;
                }

                const instanceId = data.instances?.[0]?.id;
                if (!instanceId) {
                    setTrialState('not_needed');
                    return;
                }

                const [{ data: trialExam }, { data: status }] = await Promise.all([
                    api.get('/exams/trial').catch(() => ({ data: null })),
                    api.get('/attempts/trial-status', { params: { examInstanceId: instanceId } })
                        .catch(() => ({ data: { completed: false } })),
                ]);
                if (cancelled) return;

                // No trial paper configured at all: do not strand every student
                // behind a rehearsal that does not exist.
                if (!trialExam?.id) {
                    setTrialState('not_needed');
                    return;
                }
                setTrialExamId(trialExam.id);
                setTrialState(status.completed ? 'done' : 'required');
            } catch {
                if (!cancelled) setTrialState('not_needed');
            }
        })();

        return () => { cancelled = true; };
    }, [id]);

    // Once camera permission is granted, also warm up face-api.js so Capture is instant.
    useEffect(() => {
        if (deviceChecks.webcam && faceEnrollStatus === 'not_enrolled') {
            setFaceMsg('Loading face detection models…');
            startEnrollmentCamera()
                .then(() => setFaceMsg('Position your face in the frame and click Capture.'))
                .catch(() => setFaceMsg('Could not access camera for face enrollment.'));
        }
    }, [deviceChecks.webcam, faceEnrollStatus]);

    const handleCaptureFace = async () => {
        setFaceCapturing(true);
        setFaceMsg('Capturing…');
        const descriptor = await captureDescriptor();
        if (!descriptor) {
            setFaceCapturing(false);
            setFaceMsg('No face detected. Ensure your face is clearly visible and try again.');
            return;
        }
        const ok = await enrollFace(descriptor);
        setFaceCapturing(false);
        if (ok) {
            setFaceEnrollStatus('enrolled');
            setFaceMsg('Face enrolled successfully!');
        } else {
            setFaceMsg('Enrollment failed. Please try again.');
        }
    };

    const handleStartWebcam = async () => {
        setWebcamLoading(true);
        const stream = await startWebcam();
        // useWebcam attaches the stream to the <video> internally via a
        // callback ref, so no manual srcObject assignment is needed here.
        setWebcamStarted(!!stream);
        setWebcamLoading(false);
    };

    // Auto-start webcam once the camera permission check passes
    useEffect(() => {
        if (deviceChecks.webcam && !webcamStarted && !webcamLoading) {
            handleStartWebcam();
        }
    }, [deviceChecks.webcam]);

    /**
     * Leaving the modal. The rehearsal comes first when it is still owed —
     * the same trial paper gates every exam, so it is told which one it is
     * unlocking via `?next=`, and it sends the student back here afterwards.
     */
    const handleProceed = () => {
        if (trialState === 'required' && trialExamId) {
            router.push(`/exams/${trialExamId}/play?next=${id}`);
            return;
        }
        router.push(`/exams/${id}/play`);
    };

    const handleStartClick = () => {
        setRulesAccepted(false);
        setShowConfirmModal(true);
    };

    const closeConfirmModal = () => {
        setShowConfirmModal(false);
        setRulesAccepted(false);
    };

    const RULES = buildRules(
        exam
            ? {
                  // Any question carrying negative marks makes the rule true for
                  // the paper; a paper with none must not claim otherwise.
                  negativeMarking: (exam.sections ?? []).some((s: any) =>
                      (s.questions ?? []).some((q: any) => (q.negativeMarks ?? 0) > 0),
                  ),
                  sectionCount: (exam.sections ?? []).length,
              }
            : null,
    );

    const checks = [
        {
            label: 'Screen Resolution',
            description: 'Minimum 800×600 display required',
            passed: deviceChecks.viewport,
        },
        {
            label: 'Fullscreen Support',
            description: 'Browser must support fullscreen mode',
            passed: deviceChecks.fullscreen,
        },
        {
            label: 'Webcam',
            description: deviceChecks.webcam === null
                ? 'Requesting camera permission...'
                : deviceChecks.webcam
                    ? (webcamStarted ? 'Camera active and ready' : 'Camera detected, starting...')
                    : 'Camera access denied or no camera found',
            passed: deviceChecks.webcam && webcamStarted,
        },
        {
            label: 'Microphone',
            description: deviceChecks.audio === null
                ? 'Requesting microphone permission...'
                : deviceChecks.audio
                    ? 'Microphone detected'
                    : 'No microphone found or access denied',
            passed: deviceChecks.audio,
        },
        {
            label: 'Face ID Enrollment',
            description: faceEnrollStatus === 'checking'
                ? 'Checking enrollment status...'
                : faceEnrollStatus === 'enrolled'
                    ? 'Face already enrolled'
                    : 'Required — enroll below before starting',
            passed: faceEnrollStatus === 'checking' ? null : faceEnrollStatus === 'enrolled',
        },
        // Listed as a check rather than hidden, so the rehearsal reads as one
        // more thing to complete rather than an unexplained detour on the way
        // to the exam.
        ...(trialState === 'not_needed'
            ? []
            : [
                  {
                      label: 'Trial Test',
                      description:
                          trialState === 'checking'
                              ? 'Checking…'
                              : trialState === 'done'
                                ? 'Trial test completed — you are ready'
                                : 'Required — a short practice run starts when you click below',
                      passed: trialState === 'checking' ? null : trialState === 'done',
                  },
              ]),
    ];

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <div className="instructions-page animate-fade-in">
                <div className="instructions-container">
                    <div className="instructions-header">
                        <h1>Exam Instructions</h1>
                        <p className="instructions-subtitle">
                            Please read carefully and complete the device checks before starting.
                        </p>
                    </div>

                    {/* Instructions */}
                    <div className="glass-card instructions-card">
                        <h2>📋 Rules & Guidelines</h2>
                        <ul className="rules-list">
                            {RULES.map((rule, i) => <li key={i}>{rule}</li>)}
                        </ul>
                    </div>

                    {/* Device Checks */}
                    <div className="glass-card instructions-card">
                        <h2>🔍 Device Compatibility Check</h2>
                        <div className="device-check-list">
                            {checks.map((check, i) => (
                                <div key={i} className="device-check-item">
                                    <div className={`check-icon ${check.passed ? 'pass' : check.passed === null ? 'pending' : 'fail'}`}>
                                        {check.passed ? '✓' : check.passed === null ? '…' : '✗'}
                                    </div>
                                    <div>
                                        <strong>{check.label}</strong>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            {check.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Webcam Preview */}
                    <div className="glass-card instructions-card">
                        <h2>📷 Webcam Check</h2>
                        <div className="webcam-preview" style={{ display: webcamStarted ? 'block' : 'none' }}>
                            <video ref={videoRef} autoPlay muted playsInline />
                            <div className="webcam-indicator" />
                        </div>
                        
                        {!webcamStarted && (
                            <div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>
                                    {deviceChecks.webcam === null
                                        ? 'Waiting for camera permission...'
                                        : deviceChecks.webcam === false
                                            ? 'Camera access was denied. Please allow camera access in your browser settings and try again.'
                                            : 'Starting camera...'}
                                </p>
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleStartWebcam}
                                    disabled={webcamLoading}
                                >
                                    {webcamLoading ? 'Starting...' : 'Enable Webcam'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Face ID Enrollment — required, blocks Start Exam until done */}
                    {faceEnrollStatus !== 'enrolled' && (
                        <div className="glass-card instructions-card">
                            <h2>🪪 Face ID Enrollment</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>
                                This is a proctored exam — you must enroll your face before you can start. Your face is stored as an encrypted numeric descriptor, not a photo.
                            </p>

                            {faceEnrollStatus === 'checking' ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Checking enrollment status…</p>
                            ) : (
                                <>
                                    {faceMsg && (
                                        <p style={{
                                            fontSize: '0.85rem', marginBottom: 'var(--space-3)',
                                            color: faceMsg.startsWith('No face') || faceMsg.startsWith('Enrollment failed') || faceMsg.startsWith('Could not access')
                                                ? 'var(--danger-400)' : 'var(--text-secondary)',
                                        }}>
                                            {faceMsg}
                                        </p>
                                    )}
                                    {deviceChecks.webcam && (
                                        <div className="webcam-preview" style={{ marginBottom: 'var(--space-4)' }}>
                                            <video ref={faceVideoRef} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCaptureFace}
                                        disabled={!deviceChecks.webcam || !faceModelsLoaded || faceCapturing}
                                    >
                                        {faceCapturing ? 'Saving…' : !deviceChecks.webcam ? 'Enable webcam above first' : faceModelsLoaded ? 'Capture & Enroll Face' : (faceLoadingProgress || 'Loading models…')}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Access pass gate — mirrors the server-side paywall */}
                    {passStatus === 'locked' && (
                        <div
                            className="glass-card"
                            style={{ padding: '1.25rem', marginTop: '1rem', borderLeft: '4px solid var(--color-primary)' }}
                        >
                            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>🔒 Exam access locked</h3>
                            <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem', fontSize: '0.92rem' }}>
                                One payment unlocks every olympiad exam. You only pay once — the free
                                practice paper stays available either way.
                            </p>
                            <button className="btn btn-primary" onClick={() => router.push('/unlock')}>
                                Unlock All Exams
                            </button>
                        </div>
                    )}

                    {/* Start Button */}
                    <div className="instructions-actions">
                        <button
                            className="btn btn-primary btn-lg"
                            disabled={
                                !deviceChecks.viewport ||
                                !deviceChecks.fullscreen ||
                                !webcamStarted ||
                                faceEnrollStatus !== 'enrolled' ||
                                passStatus === 'locked' ||
                                trialState === 'checking'
                            }
                            onClick={handleStartClick}
                        >
                            {trialState === 'required' ? '✅ Start Trial Test' : '✅ Start Exam'}
                        </button>
                        <p className="start-note">
                            {trialState === 'required'
                                ? 'A short trial test runs first, in the same environment as the real exam.'
                                : 'You will be asked to confirm the exam rules before the paper opens.'}
                        </p>
                    </div>
                </div>

                {/* ── Start Exam confirmation modal — must confirm understanding of all rules ── */}
                {showConfirmModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                    }}>
                        <div className="glass-card" style={{ textAlign: 'left', padding: '2.5rem', maxWidth: '520px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📋</div>
                                <h2>Confirm Exam Rules</h2>
                                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                    Please read all rules and guidelines carefully before starting.
                                </p>
                            </div>
                            <ul className="rules-list" style={{ marginBottom: '1.25rem' }}>
                                {RULES.map((rule, i) => <li key={i}>{rule}</li>)}
                            </ul>

                            {/* Acknowledgement as an explicit checkbox rather than
                                a button label. A single "I Understand, Start Exam"
                                click both agrees and starts, which makes it easy to
                                dismiss unread — the tick has to be a separate act. */}
                            <label className="rules-ack">
                                <input
                                    type="checkbox"
                                    checked={rulesAccepted}
                                    onChange={(e) => setRulesAccepted(e.target.checked)}
                                />
                                <span>
                                    I have read and understood all the rules above, and I agree to the
                                    AI proctoring terms.
                                </span>
                            </label>

                            {trialState === 'required' && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
                                    You will start with a short <strong>trial test</strong> in the same
                                    exam environment. Once you finish it, your real exam begins.
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ flex: 1, padding: '0.85rem' }}
                                    onClick={closeConfirmModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ flex: 1, padding: '0.85rem' }}
                                    disabled={!rulesAccepted}
                                    title={rulesAccepted ? undefined : 'Tick the box above to continue'}
                                    onClick={handleProceed}
                                >
                                    {trialState === 'required' ? 'Start Trial Test' : 'Start Exam'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </AuthGuard>
    );
}
