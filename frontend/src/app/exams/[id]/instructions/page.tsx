'use client';

import ExamTutorial from '@/components/exam/ExamTutorial';
import AuthGuard from '@/components/layout/AuthGuard';
import TooSmallForExam from '@/components/TooSmallForExam';
import { useDeviceCheck } from '@/hooks/useDeviceCheck';
import { useWebcam } from '@/hooks/useWebcam';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import api from '@/lib/api';
import {
    EXAM_PAUSE_TIMEOUT_SEC,
    MIN_VIEWPORT_HEIGHT,
    MIN_VIEWPORT_WIDTH,
    VIOLATION_REVIEW_THRESHOLD,
} from '@/lib/constants';
import { MONITORED_ACTIVITIES } from '@/lib/copy/onboarding';
import { preloadFaceModels } from '@/lib/faceModels';
import { enterFullscreen } from '@/lib/fullscreen';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
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
/**
 * ## Plain language
 *
 * "Rewrite technical exam documentation for timer and monitoring to use plain
 * language." Every reader here is between eleven and eighteen, and about half of
 * them are reading it in their second or third language. The rules that governed
 * whether their paper survived were written in the vocabulary of the system that
 * enforces them — "auto-submit", "violation", "AI proctoring", "integrity
 * rules" — which named the mechanism and not the consequence.
 *
 * Three things changed, and each of them is a rule a student can act on:
 *
 *  1. **Consequences before mechanisms.** "Your exam will be sent in and you
 *     cannot go back to it" is the thing they need to know; that this is called
 *     an auto-submit is not.
 *  2. **Numbers come from {@link EXAM_PAUSE_TIMEOUT_SEC} and
 *     {@link EXAM_MAX_VIOLATIONS}, never typed in.** The pause rule said 20
 *     seconds here while the player counted down from a different number, which
 *     is worse than not stating it at all.
 *  3. **Say what to *do*.** A rule the student cannot follow — "your background
 *     must be a solid colour" with no reason and no fallback — reads as a threat.
 */
function buildRules(exam: { negativeMarking?: boolean; sectionCount?: number } | null) {
    return [
        <>
            <strong>The exam fills your whole screen.</strong> It goes fullscreen by itself when
            you start, and it has to stay that way until you finish.
        </>,
        <>
            <strong>Your camera stays on the whole time.</strong> It checks that it is you sitting
            the paper and that you are alone. Nothing is filmed, and nobody watches you live. A
            single photo is saved <strong>only</strong> at the moment a violation is recorded, and
            is kept with your paper for the review team.
        </>,
        <>
            <strong>Sit in front of a plain wall, with light on your face.</strong> If the camera
            cannot see you clearly it may decide it cannot recognise you, and that counts against
            you. A blank wall and a lamp or window in front of you is all it takes.
        </>,
        <>
            <strong>If you leave fullscreen or switch to something else, the exam stops and waits
            for you.</strong> The clock keeps running while it waits. Come straight back and carry
            on.
        </>,
        <>
            <strong>If you stay away longer than {EXAM_PAUSE_TIMEOUT_SEC} seconds, your paper is
            sent in for you</strong> and you cannot go back to it. A countdown shows you exactly
            how long you have left to return. Along with your time running out, this is the{' '}
            <strong>only</strong> way your exam can end by itself.
        </>,
        <>
            <strong>Some things are recorded as violations, but none of them stops your
            exam.</strong> Leaving fullscreen, switching tab or app, your face not being visible or
            not matching, more than one person on camera, a screenshot, or refreshing the page.
            Each one tells you on screen what happened, and a photo is taken at that moment. Once
            you pass {VIOLATION_REVIEW_THRESHOLD}, a person reads the record before your result is
            confirmed. Keep answering, and tell us afterwards if something went wrong.
        </>,
        // Named separately because it is the one thing students most often do by
        // reflex when a page looks stuck, and the in-exam ↻ Reload button is the
        // answer. It no longer ends the paper, but it is still recorded.
        <>
            <strong>Try not to refresh the page or press your browser&apos;s Back button.</strong>{' '}
            Your answers and your time survive it, but it is recorded on your paper. If something
            looks broken, use the <strong>↻ Reload</strong> button inside the exam instead: it does
            the same job and is not counted against you.
        </>,
        <>
            <strong>A short internet drop will not cost you any time.</strong> Your clock is kept
            on our servers, not in the page, so it stays right even if the countdown on screen
            freezes for a moment. It fixes itself. Keep answering, and do not refresh.
        </>,
        <>
            <strong>Your time does not start until you see your first question.</strong> There is a
            &ldquo;Getting your exam ready&rdquo; screen first, while your camera starts up. None of
            that comes out of your exam time.
        </>,
        ...(exam?.sectionCount && exam.sectionCount > 1
            ? [
                  <>
                      <strong>The paper has {exam.sectionCount} parts.</strong> You go through them
                      in order, and you can move back and forth between questions as much as you
                      like.
                  </>,
              ]
            : []),
        <>
            <strong>Your answers save themselves</strong> the moment you choose one. There is
            nothing to press to save.
        </>,
        exam?.negativeMarking
            ? <>
                  <strong>A wrong answer loses you marks on this paper.</strong> If you truly have
                  no idea, leaving it blank costs you less than guessing.
              </>
            : <>
                  <strong>A wrong answer costs you nothing.</strong> There are no negative marks, so
                  never leave a question blank, guess if you have to.
              </>,
        <>
            <strong>Press Submit when you are done</strong>, and confirm it. Do not just close the
            browser.
        </>,
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

    /**
     * Explicit grade confirmation, separate from the rules tick.
     *
     * "Explicit confirmation for grade before the exam starts." Sitting the wrong
     * grade's paper is unrecoverable — the attempt is scored against that grade's
     * cohort — and the class was chosen once, at registration, possibly months
     * earlier by a parent. So it is confirmed again here, as its own deliberate
     * act, with a route out if it is wrong.
     */
    const [gradeConfirmed, setGradeConfirmed] = useState(false);

    const user = useAuthStore((s) => s.user);

    // The paper itself — needed for the marking rule, the section count, and
    // whether this exam gates on the trial.
    const [exam, setExam] = useState<any>(null);

    /**
     * Parental consent (registration part 2).
     *
     * Resolved here rather than letting the player refuse, for the same reason the
     * pass and the trial are: a student should not complete every device check and
     * *then* be turned away.
     */
    const [guardianState, setGuardianState] = useState<'checking' | 'complete' | 'missing'>('checking');
    useEffect(() => {
        api.get('/guardian/me')
            .then((r) => setGuardianState(r.data.complete ? 'complete' : 'missing'))
            // On a read failure, do not invent a refusal — the server-side gate in
            // startAttempt is authoritative and will stop them if it matters.
            .catch(() => setGuardianState('complete'));
    }, []);

    /**
     * Rehearsal gate. The server refuses to start a real exam until the trial
     * paper has been sat (`TRIAL_REQUIRED`), so resolve that here and send the
     * student to the trial first rather than letting them finish every device
     * check and then be turned away by the player.
     */
    /**
     * `unavailable` is distinct from `not_needed` on purpose.
     *
     * "Beta test not available / slot not open." `not_needed` means this paper does
     * not gate on a rehearsal at all. `unavailable` means it *does*, but no trial
     * paper is published yet — the server logs a warning and waives the gate in that
     * case, and the student deserves to be told that rather than silently shown
     * "not needed" and left to wonder where the practice run went.
     */
    const [trialState, setTrialState] = useState<
        'checking' | 'required' | 'done' | 'not_needed' | 'unavailable'
    >('checking');
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
     * has already sat it. The trial player returns here with `?trial=done`, but
     * that is only a breadcrumb — the answer always comes from the server, so a
     * hand-typed query string cannot skip the rehearsal.
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
                // behind a rehearsal that does not exist. Reported as `unavailable`
                // rather than `not_needed` so the student is told the practice run
                // is missing, not told it was never required.
                if (!trialExam?.id) {
                    setTrialState('unavailable');
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
     * Pull the face-api models down while the student reads the rules.
     *
     * This is the actual fix for the exam feeling laggy in its first seconds.
     * The models are 6.3 MB and used to be fetched inside the player, on the
     * exam clock, with the paper already interactive — so the student got
     * question one and then several seconds of a page that stuttered under the
     * download and the WebGL shader compilation that follows it.
     *
     * Here the same work costs nothing: there is no timer running, and reading
     * the rules and ticking the acknowledgement takes far longer than the load.
     * Next.js routes to the player client-side without tearing down the JS
     * context, so the weights are still in memory when it mounts.
     *
     * Fire-and-forget by design. A failure is not worth blocking the page over —
     * the player retries, and the preparing screen there has its own ceiling.
     */
    useEffect(() => {
        void preloadFaceModels().catch(() => { /* player will retry */ });
    }, []);

    /**
     * Leaving the modal. The rehearsal comes first when it is still owed —
     * the same trial paper gates every exam, so it is told which one it is
     * unlocking via `?next=`, and it sends the student back here afterwards.
     *
     * Fullscreen is requested **here**, and this is the only place it can be:
     * the Fullscreen API needs the transient user activation from this very
     * click, and the player's mount-time attempt has none, so it was always
     * rejected and every student was met with a manual "Enter Fullscreen &
     * Start" gate instead. Next.js routes without unloading the document, so
     * the fullscreen state survives the push and the player opens already
     * fullscreen — which is also what makes the resolution check pass, since
     * the window is then the size of the screen.
     *
     * Not awaited before navigating, and never blocking: if the browser refuses,
     * the player's own gate asks again rather than the student being stuck.
     */
    const handleProceed = () => {
        void enterFullscreen();
        if (trialState === 'required' && trialExamId) {
            router.push(`/exams/${trialExamId}/play?next=${id}`);
            return;
        }
        router.push(`/exams/${id}/play`);
    };

    const handleStartClick = () => {
        // Both boxes reset every time the modal opens, so neither is ever
        // pre-ticked from a previous attempt to start.
        setRulesAccepted(false);
        setGradeConfirmed(false);
        setShowConfirmModal(true);
    };

    const closeConfirmModal = () => {
        setShowConfirmModal(false);
        setRulesAccepted(false);
        setGradeConfirmed(false);
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
            // Said as the actual rule. It read "Minimum 800×600" while the code
            // checked 1024×768 against the browser window, so a student on a
            // perfectly adequate laptop was failed by a row that agreed with
            // their screen.
            description: `Minimum ${MIN_VIEWPORT_WIDTH}×${MIN_VIEWPORT_HEIGHT} screen. Your window is sized automatically when the exam starts`,
            passed: deviceChecks.viewport,
        },
        {
            label: 'Fullscreen Support',
            description: 'The exam opens fullscreen automatically when you start',
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
                    : 'Required: enroll below before starting',
            passed: faceEnrollStatus === 'checking' ? null : faceEnrollStatus === 'enrolled',
        },
        // Listed as a check rather than hidden, so the parent section reads as one
        // more thing to complete rather than a refusal that arrives at Start.
        {
            label: 'Parent / guardian consent',
            description:
                guardianState === 'checking'
                    ? 'Checking…'
                    : guardianState === 'complete'
                      ? 'Recorded: nothing more needed'
                      : 'Required: a parent or guardian must complete this once',
            passed: guardianState === 'checking' ? null : guardianState === 'complete',
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
                                ? 'Trial test completed: you can practise again as often as you like'
                                : trialState === 'unavailable'
                                  ? 'The trial paper is not open yet: you can still start this exam'
                                  : 'Required: a short practice run starts when you click below',
                      passed:
                          trialState === 'checking'
                              ? null
                              : trialState === 'done' || trialState === 'unavailable',
                  },
              ]),
    ];

    /**
     * A phone or a small window cannot run the player, so say so here rather than
     * showing a device-check row reading "Screen Resolution ✗" with a disabled
     * button and no explanation of what to change.
     */
    if (deviceChecks.viewport === false) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                <TooSmallForExam />
            </AuthGuard>
        );
    }

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

                    {/* Which paper this is. Stated before anything else, because it
                        is the one thing that cannot be undone after the fact. */}
                    {user?.classBand && (
                        <div className="grade-banner">
                            <span className="grade-banner__eyebrow">You are about to sit</span>
                            <strong className="grade-banner__grade">
                                Grade {user.classBand} Olympiad
                            </strong>
                            {exam?.title && <span className="grade-banner__exam">{exam.title}</span>}
                            <Link href="/support" className="grade-banner__wrong">
                                Not your grade?
                            </Link>
                        </div>
                    )}

                    {/* Instructions */}
                    <div className="glass-card instructions-card">
                        <h2>📋 Rules & Guidelines</h2>
                        <ul className="rules-list">
                            {RULES.map((rule, i) => <li key={i}>{rule}</li>)}
                        </ul>
                    </div>

                    {/* The screen itself, drawn and labelled. Placed directly
                        after the rules because most of the rules are about
                        things on that screen, and a student who has just read
                        "use the ↻ Reload button" needs to be shown where it is. */}
                    <ExamTutorial />

                    {/* What the proctoring actually looks for.
                        Openly listed rather than left to be discovered as a
                        violation: a student who knows the rules can follow them, and
                        surprise is what makes proctoring feel punitive. */}
                    <div className="glass-card instructions-card">
                        <h2>👁️ What the invigilator watches for</h2>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                            These are recorded during the exam. Nothing is decided automatically, a
                            person reviews anything serious before any conclusion is drawn.
                        </p>
                        <ul className="rules-list">
                            {MONITORED_ACTIVITIES.map((activity) => (
                                <li key={activity}>{activity}</li>
                            ))}
                        </ul>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-3)' }}>
                            Face analysis runs inside your own browser and no video is ever recorded
                            or stored. Only the events above are sent, along with one still photo
                            taken at the moment a violation is recorded — never at any other time.
                        </p>
                    </div>

                    {/* Parental consent gate — mirrors the server-side refusal. */}
                    {guardianState === 'missing' && (
                        <div className="glass-card instructions-card instructions-card--blocked">
                            <h2>👨‍👩‍👧 Parent consent needed</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>
                                A parent or guardian has to give consent before you can start any
                                exam, including the practice paper. It takes about two minutes and
                                only needs doing once.
                            </p>
                            <button
                                className="btn btn-primary"
                                onClick={() => router.push(`/guardian?next=/exams/${id}/instructions`)}
                            >
                                Complete the parent section
                            </button>
                        </div>
                    )}

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
                                This is a proctored exam, you must enroll your face before you can start. Your face is stored as an encrypted numeric descriptor, not a photo.
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
                                One payment unlocks every olympiad exam. You only pay once, the free
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
                                guardianState !== 'complete' ||
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

                        {/* The practice run, offered every time.
                            The rehearsal is not a one-off gate to be cleared and
                            forgotten — it is the only place a student can feel what
                            fullscreen, the webcam and the timer are actually like,
                            and there is no reason to allow that exactly once. It is
                            deliberately here rather than on the dashboard: the trial
                            is part of sitting an exam, not an exam of its own. */}
                        {trialState === 'done' && (
                            <button
                                className="btn btn-secondary"
                                style={{ marginTop: 'var(--space-3)' }}
                                disabled={!deviceChecks.viewport || !deviceChecks.fullscreen}
                                onClick={() => {
                                    if (!trialExamId) return;
                                    // Same click-gesture fullscreen entry as the real
                                    // exam — the practice run has to be a faithful
                                    // rehearsal or it is not rehearsing anything.
                                    void enterFullscreen();
                                    router.push(`/exams/${trialExamId}/play?next=${id}`);
                                }}
                            >
                                🎯 Take the practice test again
                            </button>
                        )}
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

                            {/* Grade confirmed as its own act, not folded into the
                                rules tick. Sitting the wrong grade's paper cannot be
                                undone — the attempt is scored against that grade's
                                cohort — and the class was chosen once at registration,
                                possibly months ago by a parent. */}
                            {user?.classBand && (
                                <>
                                    <label className="rules-ack rules-ack--grade">
                                        <input
                                            type="checkbox"
                                            checked={gradeConfirmed}
                                            onChange={(e) => setGradeConfirmed(e.target.checked)}
                                        />
                                        <span>
                                            I confirm I am in <strong>Class {user.classBand}</strong> and
                                            that the <strong>Grade {user.classBand} Olympiad</strong> is
                                            the correct paper for me.
                                        </span>
                                    </label>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1rem' }}>
                                        This cannot be changed once the exam starts. If your class is
                                        wrong, <Link href="/support">contact support</Link> before
                                        starting. Do not sit the wrong paper.
                                    </p>
                                </>
                            )}

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
                                    // The grade tick is only demanded when there is a
                                    // grade to confirm, so an account without a class
                                    // band is not stuck behind an unanswerable box.
                                    disabled={!rulesAccepted || (Boolean(user?.classBand) && !gradeConfirmed)}
                                    title={
                                        rulesAccepted && (!user?.classBand || gradeConfirmed)
                                            ? undefined
                                            : 'Tick both boxes above to continue'
                                    }
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
