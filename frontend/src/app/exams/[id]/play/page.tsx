'use client';

import AutoSubmitNotice, { type AutoSubmitState } from '@/components/exam/AutoSubmitNotice';
import ExamPreparingOverlay from '@/components/exam/ExamPreparingOverlay';
import ProctorToast, { type ProctorToastData } from '@/components/exam/ProctorToast';
import ViolationBanner from '@/components/exam/ViolationBanner';
import AuthGuard from '@/components/layout/AuthGuard';
import LimonTour from '@/components/limon/LimonTour';
import MascotToast from '@/components/MascotToast';
import { useExamLockdown, type BlockedAction, type LockdownBreach } from '@/hooks/useExamLockdown';
import { useExamSession } from '@/hooks/useExamSession';
import { useFaceProctor, NO_FACE_SUSTAIN_MS, LOOKING_AWAY_SUSTAIN_MS, FACE_MISMATCH_SUSTAIN_MS } from '@/hooks/useFaceProctor';
import { useFullscreenMonitor } from '@/hooks/useFullscreenMonitor';
import { useIdleMonitor } from '@/hooks/useIdleMonitor';
import { useTimer } from '@/hooks/useTimer';
import api from '@/lib/api';
import {
    EXAM_IDLE_NUDGE_SEC,
    EXAM_PAUSE_TIMEOUT_SEC,
    FACE_TOAST_COOLDOWN_MIN,
    TIMER_DANGER_THRESHOLD,
    TIMER_WARNING_THRESHOLD,
    VIOLATION_REVIEW_THRESHOLD,
} from '@/lib/constants';
import {
    isAttemptAlreadyFinished,
    submitErrorMessage,
    violationConsequence,
    violationCopy,
    type AutoSubmitCause,
    type ViolationKind,
} from '@/lib/examIntegrity';
import { cueIsWorthShowing, MascotCue, nextMascotCue } from '@/lib/mascot';
import { useAuthStore } from '@/store/authStore';
import { useProctorStore } from '@/store/proctorStore';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Seconds the exam is paused before it submits itself. Shared with the copy. */
const PAUSE_TIMEOUT_SEC = EXAM_PAUSE_TIMEOUT_SEC;

/** What a blocked (not breached) lockdown action tells the student. */
const BLOCKED_ACTION_COPY: Record<BlockedAction, string> = {
    reload: 'Reloading is disabled during the exam. Use the ↻ Reload button in the header if the page looks wrong, it keeps your answers and your timer.',
    back: 'The browser Back button is disabled during the exam. You cannot leave this page until you submit.',
    print: 'Printing the exam is not allowed. This attempt has been recorded.',
    capture: 'Screenshots are not allowed during the exam. This attempt has been recorded.',
    devtools: 'Developer tools are disabled during the exam.',
    copy: 'Copying exam content is not allowed.',
};

/**
 * What a *successful* reload or back-navigation says.
 *
 * Distinct from {@link BLOCKED_ACTION_COPY}, which is for things stopped before
 * they happened: telling a student "reloading is disabled" on a page that has
 * visibly just reloaded is obviously untrue and reads as a broken site. This one
 * has to say what actually happened, that their work survived it, and that it
 * was noted.
 */
const BREACH_COPY: Record<LockdownBreach, string> = {
    reload: 'The exam page was reloaded. Your answers and your remaining time were kept, and you can carry on. It has been recorded on your paper, so use the ↻ Reload button above if you need to refresh again.',
    back: 'You navigated back into the exam. Your answers and your remaining time were kept, and you can carry on. It has been recorded on your paper.',
};

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface SectionBlock {
    id: string;
    title: string;
    /** Indices into the flat `questions` array, in order. */
    indices: number[];
}

/**
 * Groups the flat question list into the sections the server sent it in.
 *
 * The server delivers questions already ordered section-by-section and stamps
 * each one with `sectionId`/`sectionTitle`, so this only has to find the
 * boundaries — it must never reorder anything. An exam whose questions carry no
 * section (a legacy paper, or the practice exam) collapses to a single unnamed
 * block and the section chrome hides itself.
 */
function groupBySection(questions: any[]): SectionBlock[] {
    const blocks: SectionBlock[] = [];
    questions.forEach((q, i) => {
        const id = q.sectionId ?? '__all__';
        const last = blocks[blocks.length - 1];
        if (last && last.id === id) {
            last.indices.push(i);
        } else {
            blocks.push({ id, title: q.sectionTitle ?? '', indices: [i] });
        }
    });
    return blocks;
}

/**
 * Question media that fails visibly rather than silently.
 *
 * "Image based questions to be checked." A question whose illustration does not
 * load is not merely ugly — it is unanswerable, and a browser's broken-image
 * glyph gives the student no idea whether the picture is missing, still loading,
 * or simply not part of the question. Under exam time pressure that is the
 * difference between "wait a second" and "give up on this one".
 *
 * `key={src}` on the state reset matters: moving between two questions that both
 * carry media reuses this component, and a stale `failed` from the previous
 * question would hide an image that is perfectly fine.
 */
function QuestionImage({ src, alt }: { src: string; alt: string }) {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        setFailed(false);
        setLoaded(false);
    }, [src]);

    if (failed) {
        return (
            <div className="question-media-error">
                <p>
                    <strong>The image for this question didn&apos;t load.</strong> It is usually a
                    brief network problem, your answers are saved, and the timer is unaffected.
                </p>
                <div className="question-media-error__actions">
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => {
                            setFailed(false);
                            // Cache-bust so a failed fetch is genuinely retried
                            // rather than served from the browser's negative cache.
                            setAttempt((a) => a + 1);
                        }}
                    >
                        ↻ Try loading it again
                    </button>
                    <a
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary"
                    >
                        Open in a new tab ↗
                    </a>
                </div>
            </div>
        );
    }

    return (
        <>
            {!loaded && <div className="question-media-loading">Loading image…</div>}
            <img
                src={attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`}
                alt={alt}
                className="question-media"
                style={loaded ? undefined : { display: 'none' }}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
            />
        </>
    );
}

/** Same contract as {@link QuestionImage}, for video. */
function QuestionVideo({ src }: { src: string }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => setFailed(false), [src]);

    if (failed) {
        return (
            <div className="question-media-error">
                <p>
                    <strong>The video for this question didn&apos;t load.</strong> Your answers are
                    saved and the timer is unaffected.
                </p>
                <div className="question-media-error__actions">
                    <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
                        Open in a new tab ↗
                    </a>
                </div>
            </div>
        );
    }

    return (
        <video
            src={src}
            controls
            // No autoplay: a video starting on its own during a timed exam is
            // startling, and several questions may carry one.
            preload="metadata"
            className="question-media"
            onError={() => setFailed(true)}
        />
    );
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
    const [showReloadConfirm, setShowReloadConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    /**
     * Trial mode. `?next=<real exam id>` marks this run as the rehearsal that
     * gates that exam: the paper is not scored, and on submit we record the
     * completion and hand the student straight on to the real thing.
     *
     * Read from the URL rather than from the exam, because the *same* trial
     * exam gates every real exam — which one it is unlocking is a property of
     * this run, not of the paper.
     */
    const [nextExamId, setNextExamId] = useState<string | null>(null);
    useEffect(() => {
        const next = new URLSearchParams(window.location.search).get('next');
        setNextExamId(next && /^[0-9a-fA-F-]{36}$/.test(next) ? next : null);
    }, []);
    const isTrialRun = Boolean(exam?.isTrial) || Boolean(nextExamId);

    const attemptId = attempt?.id || '';
    const { remaining, isExpired } = useTimer(attemptId);

    // Latest-ref for submit so the auto-submit callback (registered once with
    // empty deps in the fullscreen hook) always calls the freshest version.
    const submitExamRef = useRef(submitExam);
    useEffect(() => { submitExamRef.current = submitExam; });

    // Same reason, for the post-submit destination: it depends on `nextExamId`,
    // which is only known after the mount effect reads the query string. A
    // callback captured on first render would still think this is a normal run.
    const destinationRef = useRef<(redirectUrl?: string) => Promise<string>>(
        async (redirectUrl?: string) => redirectUrl ?? '/feedback/exam',
    );

    // handleAutoSubmit needs stopProctoring (from useFaceProctor, declared
    // below) and useFullscreenMonitor needs handleAutoSubmit — a genuine
    // circular dependency between the two hooks. Break it with a ref: define
    // the callback body now, referencing stopProctoring via a ref that gets
    // populated once useFaceProctor is called further down.
    const stopProctoringRef = useRef<(() => void) | null>(null);
    const clearViolationStorageRef = useRef<() => void>(() => {});
    const suspendViolationsRef = useRef<() => void>(() => {});
    /** Populated from `useFaceProctor` below — same circular-dependency dodge. */
    const captureSnapshotRef = useRef<(() => string | null) | null>(null);
    /** When a violation snapshot was last taken, so the student can be told. */
    const [photoCapturedAt, setPhotoCapturedAt] = useState<number | null>(null);

    const releaseLockdownRef = useRef<() => void>(() => {});

    /**
     * Ends the exam without the student's involvement — time expiry, the pause
     * timeout, the final violation, or a lockdown breach.
     *
     * Four things this has to get right, all of which it previously got wrong:
     *
     *  1. **Never leave the student stranded.** A failed submit used to be
     *     swallowed into `console.error` with `isSubmitting` stuck at `true`.
     *     Because `handleAutoSubmit` early-returns while submitting, that one
     *     failure permanently disabled every later auto-submit: the student sat
     *     in front of a paper that would not end and showed no error. Failures
     *     now retry once, then surface a manual "Submit now" control.
     *
     *  2. **Say something on screen, and say *why*.** `alert()` is a blocking
     *     dialog that browsers throttle or suppress, and it can drop fullscreen —
     *     firing yet another violation. `cause` drives a real overlay that names
     *     the reason (see {@link AutoSubmitNotice}).
     *
     *  3. **Do not navigate out from under the explanation.** The redirect is
     *     parked in `pendingRedirectRef` and only followed once the student
     *     acknowledges the notice, or the notice times out. On a fast connection
     *     the old code replaced the page inside a second, so the reason was never
     *     readable — which is exactly why an auto-submit read as a crash.
     *
     *  4. **Still navigate on a hard failure.** If the server has already
     *     recorded the submission, the client's error is cosmetic — leaving the
     *     student on the paper is worse than moving them on.
     */
    const [autoSubmit, setAutoSubmit] = useState<AutoSubmitState | null>(null);
    const pendingRedirectRef = useRef<string>('/results');

    /**
     * Stage one: announce the ending.
     *
     * The paper is frozen here — the notice overlay covers the viewport, so no
     * answer can be changed — but nothing has been sent yet. This exists purely
     * so the exam does not vanish mid-question with no explanation, which is how
     * an auto-submit reads when it fires instantly.
     */
    const beginAutoSubmit = (cause: AutoSubmitCause, violation?: ViolationKind) => {
        if (autoSubmit || isSubmitting) return;
        setAutoSubmit({ cause, violation, status: 'warning' });
        // The paper is ending. Leaving the page drops fullscreen, and that must
        // not be charged to the student on their way out.
        suspendViolationsRef.current();
        stopProctoringRef.current?.();
        clearViolationStorageRef.current();
        // The paper is over: stop the exit guards fighting the redirect we are
        // about to make, and clear the re-entry marker so a lock cannot outlive
        // the attempt it belongs to.
        releaseLockdownRef.current();
    };

    /** Stage two: actually submit. Reached by the countdown or "Submit now". */
    const runAutoSubmit = async (
        cause: AutoSubmitCause,
        violation?: ViolationKind,
        isRetry = false,
    ) => {
        if (isSubmitting && !isRetry) return;
        setIsSubmitting(true);
        setAutoSubmit({ cause, violation, status: 'submitting' });

        const finish = async (redirectUrl?: string) => {
            pendingRedirectRef.current = await destinationRef.current(redirectUrl);
            setAutoSubmit({ cause, violation, status: 'done' });
        };

        try {
            const result = await submitExamRef.current();
            await finish(result?.redirectUrl);
        } catch (err) {
            // The attempt is already finished — the server closed it first,
            // which is what happens when the clock ran out (`expireIfOverdue`)
            // or an earlier auto-submit landed. From the student's side that is
            // a success: their answers are scored and stored. Reporting it as
            // "Could not submit automatically — status code 400" was alarming
            // and simply untrue, and left them pressing Submit against a paper
            // that had already been submitted.
            if (isAttemptAlreadyFinished(err)) {
                await finish(undefined);
                return;
            }
            console.error('Auto-submit failed:', err);
            // One automatic retry — the common cause is a transient network
            // blip on a school connection, not a rejected submission.
            try {
                const result = await submitExamRef.current();
                await finish(result?.redirectUrl);
                return;
            } catch (retryErr) {
                if (isAttemptAlreadyFinished(retryErr)) {
                    await finish(undefined);
                    return;
                }
                console.error('Auto-submit retry failed:', retryErr);
                setIsSubmitting(false); // let the student trigger it themselves
                setAutoSubmit({
                    cause,
                    violation,
                    status: 'failed',
                    error: submitErrorMessage(retryErr),
                });
            }
        }
    };

    const handleAutoSubmit = (cause: 'paused_too_long', violation?: ViolationKind) => {
        beginAutoSubmit(cause, violation);
    };

    const continueAfterAutoSubmit = useCallback(() => {
        window.location.href = pendingRedirectRef.current;
    }, []);

    const {
        isFullscreen, violationCount, isGated, lastError, lastViolation, pauseDeadline,
        requestFullscreen, reportExternalViolation, suspendViolations,
    } = useFullscreenMonitor({
        /**
         * A violation was *counted* — the moment the on-screen "2 / 3" ticks up.
         *
         * Every kind is posted here, including the face ones, and every one
         * carries `counted: true`. That flag is what the server totals for the
         * "violations recorded" figure the student is shown after submitting.
         *
         * The face kinds used to be skipped on the grounds that `useFaceProctor`
         * already posts them — but it posts one event per *detection tick*, so a
         * student whose face was out of frame for a minute generated a dozen
         * rows for what the counter showed as one violation. Totalling those
         * would have reported a number nothing on screen ever agreed with.
         */
        onViolation: async (type, count) => {
            if (!attemptId) return;
            try {
                // A still from the camera, kept *only* here — at the instant a
                // violation is recorded. Nothing is captured on a timer, so a
                // student who trips no rule has no image stored anywhere, which
                // is what the registration copy and the parent's consent
                // promise. Without it, "your face didn't match" is an assertion
                // with nothing behind it that a reviewer can weigh or a student
                // can appeal.
                const snapshot = captureSnapshotRef.current?.() ?? null;
                const backendType =
                    type === 'exit_fullscreen' ? 'EXIT_FULLSCREEN'
                    : type === 'tab_switch'     ? 'TAB_SWITCH'
                    // A screenshot or print attempt. SCREEN_CAPTURE already
                    // carries the right severity (5) in the proctor service.
                    : type === 'screen_capture' ? 'SCREEN_CAPTURE'
                    : type === 'no_face'        ? 'NO_FACE'
                    : type === 'looking_away'   ? 'LOOKING_AWAY'
                    : type === 'face_mismatch'  ? 'FACE_MISMATCH'
                    : type === 'multiple_faces' ? 'MULTIPLE_FACES'
                    :                              'WINDOW_BLUR';
                await api.post('/proctor/events', {
                    attemptId,
                    type: backendType,
                    details: { violationCount: count, source: type, counted: true },
                    ...(snapshot ? { snapshot } : {}),
                });
                if (snapshot) setPhotoCapturedAt(Date.now());
            } catch { /* best-effort */ }
        },
        onAutoSubmit: handleAutoSubmit,
        pauseTimeoutSec: PAUSE_TIMEOUT_SEC,
    });

    // The student's own grade, for the "Grade N Olympiad" label on the paper.
    const user = useAuthStore((s) => s.user);

    const {
        videoRef,
        isLoaded: faceModelsLoaded,
        isWarm: faceModelsWarm,
        loadingProgress,
        currentFaceCount,
        isIdentityVerified,
        noFaceSince,
        awaySince,
        mismatchSince,
        startProctoring,
        prepareProctoring,
        stopProctoring,
        captureSnapshot,
    } = useFaceProctor({
        attemptId,
        onSustainedViolation: (type) => reportExternalViolation(
            type === 'NO_FACE' ? 'no_face' : type === 'LOOKING_AWAY' ? 'looking_away' : 'face_mismatch',
        ),
        onInstantViolation: () => reportExternalViolation('multiple_faces'),
    });

    useEffect(() => { stopProctoringRef.current = stopProctoring; });
    useEffect(() => { suspendViolationsRef.current = suspendViolations; }, [suspendViolations]);
    useEffect(() => { captureSnapshotRef.current = captureSnapshot; }, [captureSnapshot]);

    /**
     * The "getting your exam ready" gate.
     *
     * Held until proctoring is genuinely running, rather than handing over a
     * paper that stutters while 6.3 MB of models download and TensorFlow
     * compiles its shaders underneath it. See {@link ExamPreparingOverlay} —
     * it opens the exam anyway after {@link PREPARE_MAX_SECONDS}, so none of
     * these steps can strand a student.
     *
     * Skipped entirely on a resumed paper: the models are already warm by then,
     * and making someone who reloaded sit through a preparation screen for work
     * that is already done is just another delay on their clock.
     */
    const [isPrepared, setIsPrepared] = useState(false);
    const webcamStream = useProctorStore((s) => s.webcamStream);
    const prepareSteps = useMemo(() => [
        { key: 'camera', label: 'Starting your camera', done: Boolean(webcamStream) },
        { key: 'models', label: 'Loading AI proctoring', done: faceModelsLoaded },
        { key: 'warm', label: 'Warming up face detection', done: faceModelsWarm },
    ], [webcamStream, faceModelsLoaded, faceModelsWarm]);

    const markPrepared = useCallback(() => setIsPrepared(true), []);
    // Owned here, not in the overlay — see the `startedAt` prop's note.
    const prepareStartedAtRef = useRef(Date.now());

    // ── Browser lockdown: back, reload, screenshots ─────────────────────────
    /** A blocked action's explanation, shown as a transient notice. */
    const [blockedNotice, setBlockedNotice] = useState<{ action: BlockedAction; at: number } | null>(null);
    /** A reload or back-navigation that actually succeeded. Recorded, not fatal. */
    const [breachNotice, setBreachNotice] = useState<{ breach: LockdownBreach; at: number } | null>(null);

    const { isMasked, reload: reloadExam, release: releaseLockdown } = useExamLockdown({
        attemptId,
        // Never during the trial run: the rehearsal exists so a student can find
        // out what the rules feel like, and locking their practice paper for
        // pressing Back teaches them nothing except to be afraid of the button.
        enabled: Boolean(attemptId) && !isTrialRun && !autoSubmit,
        /**
         * A reload or a back-navigation actually got through.
         *
         * Recorded, and told to the student, but it no longer ends the paper —
         * the only two things that do are the clock and the pause timeout. A
         * refresh is very often a school laptop or a flaky connection rather
         * than a student trying something, and ending an olympiad over it was
         * too blunt an instrument for how ambiguous the signal is. The reviewer
         * gets the event either way.
         */
        onBreach: (breach) => {
            void api.post('/proctor/events', {
                attemptId,
                // No dedicated enum member for this; SEB_VIOLATION is the
                // "secure environment was broken out of" bucket and already
                // carries severity 5. The specific cause is in `details`.
                type: 'SEB_VIOLATION',
                details: { source: `navigation_${breach}`, violationCount, counted: true },
            }).catch(() => { /* best-effort */ });
            setBreachNotice({ breach, at: Date.now() });
        },
        onBlocked: (action) => setBlockedNotice({ action, at: Date.now() }),
        // A capture attempt is a real violation, not just a blocked keystroke —
        // it costs a strike and is posted as SCREEN_CAPTURE for review.
        onCaptureAttempt: () => reportExternalViolation('screen_capture'),
    });
    useEffect(() => { releaseLockdownRef.current = releaseLockdown; }, [releaseLockdown]);

    // Blocked-action notices are informational and self-clear; violations do not.
    useEffect(() => {
        if (!blockedNotice) return;
        const t = setTimeout(() => setBlockedNotice(null), 6000);
        return () => clearTimeout(t);
    }, [blockedNotice]);

    // A breach notice stays longer than a blocked one: the student has just
    // watched the page reload and needs time to read that their work survived.
    useEffect(() => {
        if (!breachNotice) return;
        const t = setTimeout(() => setBreachNotice(null), 12000);
        return () => clearTimeout(t);
    }, [breachNotice]);


    // Live "now" tick so the face/gaze popup countdowns re-render every 0.5s.
    const [nowTick, setNowTick] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNowTick(Date.now()), 500);
        return () => clearInterval(t);
    }, []);
    // Shares the same 0.5s tick as the face popups.
    const pauseSecondsLeft = pauseDeadline !== null
        ? Math.max(0, Math.ceil((pauseDeadline - nowTick) / 1000))
        : null;
    const noFaceSecondsLeft = noFaceSince ? Math.max(0, Math.ceil((NO_FACE_SUSTAIN_MS - (nowTick - noFaceSince)) / 1000)) : null;
    const awaySecondsLeft = awaySince ? Math.max(0, Math.ceil((LOOKING_AWAY_SUSTAIN_MS - (nowTick - awaySince)) / 1000)) : null;
    const mismatchSecondsLeft = mismatchSince ? Math.max(0, Math.ceil((FACE_MISMATCH_SUSTAIN_MS - (nowTick - mismatchSince)) / 1000)) : null;
    const isMultiFace = currentFaceCount > 1;

    /**
     * Face-check notices, rate-limited to one per
     * {@link FACE_TOAST_COOLDOWN_MIN} minutes.
     *
     * These used to be dismissed per *episode*, which sounds equivalent and is
     * not: in poor light the camera loses a face several times a minute, and
     * each loss is a new episode with a new `since` timestamp, so the student
     * got the same toast over and over for a problem they had already been told
     * about and could not always fix. Now the first one through starts a
     * cooldown and the rest are silent.
     *
     * Silent means *the toast* — every episode is still counted as a violation
     * and still posted to the server. This throttles the interruption, not the
     * record.
     *
     * The counter starts at the first violation rather than at exam start, so a
     * student whose camera is fine for twenty minutes still gets told promptly
     * the first time it is not.
     */
    const FACE_TOAST_COOLDOWN_MS = FACE_TOAST_COOLDOWN_MIN * 60_000;
    const [faceToast, setFaceToast] = useState<ProctorToastData | null>(null);
    const lastFaceToastAtRef = useRef(0);

    useEffect(() => {
        if (isTrialRun || isGated || autoSubmit) return;

        const issue =
            isMultiFace ? {
                key: 'multiface', icon: '👥', title: 'Limon sees more than one person',
                message: 'Only you should be in front of the camera. Ask anyone else in the room to move out of shot.',
            }
            : noFaceSince !== null ? {
                key: 'no-face', icon: '👤', title: 'Limon can’t see you',
                message: 'Move back in front of the camera and make sure there is light on your face.',
            }
            : mismatchSince !== null ? {
                key: 'mismatch', icon: '⚠️', title: 'Limon isn’t sure it’s you',
                message: 'The face on camera doesn’t match the one you scanned when you registered. Sit square to the camera, in good light.',
            }
            : awaySince !== null ? {
                key: 'looking-away', icon: '👀', title: 'Limon says eyes on the screen',
                message: 'You have been looking away for a while. Glance up only briefly if you must.',
            }
            : null;

        if (!issue) return;
        const now = Date.now();
        if (now - lastFaceToastAtRef.current < FACE_TOAST_COOLDOWN_MS) return;
        lastFaceToastAtRef.current = now;
        // The timestamp is part of the key so a toast shown after a cooldown is
        // a genuinely new one to ProctorToast and restarts its own dismiss timer.
        setFaceToast({ ...issue, key: `${issue.key}-${now}`, durationMs: 7000 });
    }, [
        isMultiFace, noFaceSince, mismatchSince, awaySince,
        isTrialRun, isGated, autoSubmit, FACE_TOAST_COOLDOWN_MS,
    ]);

    const [showViolationInfo, setShowViolationInfo] = useState(false);

    // The violation banner is dismissed per *episode*, not per kind: leaving
    // fullscreen twice must warn twice. `at` is the episode's identity.
    const [dismissedViolationAt, setDismissedViolationAt] = useState<number | null>(null);
    const visibleViolation =
        lastViolation && lastViolation.at !== dismissedViolationAt ? lastViolation : null;

    /**
     * Limon's timer checks — every 30% of the paper, plus a last-3-minutes warning.
     *
     * Elapsed time is derived from the **server** timer (`duration − remaining`)
     * rather than from `Date.now()` against the attempt's start: the timer is
     * server-authoritative, so this survives a clock skew, a page refresh and a
     * dropped connection, and a student who reloads at 65% still gets the 60%
     * check they missed.
     *
     * `timerReady` guards the first render. Before the socket's first tick,
     * `remaining` is 0, which would compute elapsed as the *whole* duration and
     * fire every cue instantly on a paper the student has not started.
     */
    const durationSeconds = (exam?.durationMinutes ?? 0) * 60;
    const [timerReady, setTimerReady] = useState(false);
    useEffect(() => {
        if (remaining > 0) setTimerReady(true);
    }, [remaining]);

    /**
     * Time's up.
     *
     * The server has always closed an overdue attempt (`expireIfOverdue` /
     * `autoSubmit` in AttemptService), and the timer socket has always emitted
     * `exam-expired` — but nothing on this page listened. A student who ran out
     * the clock watched the timer sit at 00:00 with the paper still on screen
     * and no indication that anything had happened, then found their attempt
     * already submitted when they finally pressed Submit. This closes the loop
     * on the client and, more to the point, tells them why.
     *
     * `timerReady` is what keeps this from firing on the very first render,
     * where `remaining` is 0 only because no tick has arrived yet.
     */
    useEffect(() => {
        if (!attemptId || autoSubmit || isSubmitting) return;
        if (isExpired || (timerReady && remaining <= 0)) {
            beginAutoSubmit('time_up');
        }
    }, [isExpired, timerReady, remaining, attemptId, autoSubmit, isSubmitting]);

    const [firedCueIds, setFiredCueIds] = useState<ReadonlySet<string>>(() => new Set());
    const [activeCue, setActiveCue] = useState<MascotCue | null>(null);

    useEffect(() => {
        // Never while the paper is paused/gated: a toast behind the fullscreen
        // overlay would be unreadable and unclosable.
        if (!timerReady || isGated || activeCue || durationSeconds <= 0) return;

        const elapsed = durationSeconds - remaining;
        const cue = nextMascotCue(elapsed, durationSeconds, firedCueIds);
        if (!cue) return;

        // The trial gets the 3-minute warning but not the pep talks. A rehearsal
        // is short and the point of it is the mechanics — and "your paper submits
        // itself when the clock runs out" *is* mechanics, which is precisely the
        // thing a student should meet for the first time in a rehearsal rather
        // than in the real paper.
        const suppressedByTrial = isTrialRun && cue.tone !== 'warning';

        // Mark fired even when suppressed, so a cue that is not worth showing on a
        // short paper is not re-evaluated on every tick for the rest of the exam.
        setFiredCueIds((prev) => new Set(prev).add(cue.id));
        if (!suppressedByTrial && cueIsWorthShowing(cue, exam?.durationMinutes ?? 0)) {
            setActiveCue(cue);
        }
    }, [timerReady, remaining, durationSeconds, isTrialRun, isGated, activeCue, firedCueIds, exam?.durationMinutes]);

    const dismissCue = useCallback(() => setActiveCue(null), []);

    /**
     * The top-left slot: the photo-capture confirmation and the idle nudge.
     *
     * One slot rather than two because `ProctorToast` has exactly two fixed
     * corners and the bottom-left one belongs to face notices — two toasts
     * sharing a corner would render on top of each other.
     */
    const [statusToast, setStatusToast] = useState<ProctorToastData | null>(null);

    /**
     * "A photo was taken", said out loud, every time one actually is.
     *
     * There is no interval here any more, and that is the point. A photo is
     * captured at the instant a violation is recorded and at no other time, so
     * this toast fires exactly as often as a picture of the student exists —
     * never on a clean paper. A timed "identity checked" message that fired
     * whether or not anything was captured trained students to ignore it, which
     * is the worst possible outcome for the one notice that reports a camera
     * capturing them.
     */
    useEffect(() => {
        if (!photoCapturedAt) return;
        setStatusToast({
            key: `photo-${photoCapturedAt}`,
            icon: '📸',
            title: 'Photo taken',
            message: 'A photo was taken because a violation was recorded just now. It is kept with your paper for the review team, and it is the only time a picture of you is stored.',
            durationMs: 7000,
        });
    }, [photoCapturedAt]);

    /**
     * Nothing has moved for {@link EXAM_IDLE_NUDGE_SEC} seconds.
     *
     * Recorded for the reviewer's timeline and said to the student, but it does
     * not cost a strike — see {@link useIdleMonitor} for why counting stillness
     * would punish careful reading. Off during the trial and while the paper is
     * gated, where being still is the correct thing to be doing.
     */
    const { markActive: markStudentActive } = useIdleMonitor({
        enabled: Boolean(attemptId) && !isTrialRun && !isGated && !autoSubmit,
        thresholdSec: EXAM_IDLE_NUDGE_SEC,
        onIdle: (idleSeconds) => {
            setStatusToast({
                key: `idle-${Date.now()}`,
                icon: '🖱️',
                title: 'Still there?',
                message: `Nothing has moved on your screen for ${idleSeconds} seconds. Your timer is still running, so carry on when you are ready.`,
                durationMs: 6000,
            });
            void api.post('/proctor/events', {
                attemptId,
                type: 'INACTIVITY',
                details: { idleSeconds, thresholdSec: EXAM_IDLE_NUDGE_SEC },
            }).catch(() => { /* best-effort */ });
        },
    });

    /**
     * Phase 1 — get proctoring ready, before there is an attempt to bill it to.
     *
     * None of this needs an attempt: the models, the camera and the WebGL
     * warm-up are all client-side. Doing them first is the whole fix for "the
     * timer starts before the exam does" — the server stamps `startedAt` when
     * the attempt is created, so anything done after that is charged to the
     * student's paper whether they can see it or not.
     */
    useEffect(() => {
        void prepareProctoring();
    }, []);

    /**
     * Phase 2 — create the attempt, which is what actually starts the clock.
     *
     * Gated on the preparing screen letting go, either because everything is
     * ready or because it hit its own ceiling. Nothing before this point costs
     * the student a second of exam time.
     */
    useEffect(() => {
        if (!isPrepared) return;
        startExam().catch(err => console.warn('Exam init warning:', err));
    }, [isPrepared]);

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
    // `runAutoSubmit` is defined above this point but needs it, so it reaches
    // it through a ref rather than the two being reordered.
    useEffect(() => { clearViolationStorageRef.current = clearViolationStorage; });

    /**
     * Where a finished attempt sends the student.
     *
     * A trial run goes back to the instructions page of the exam it unlocks,
     * having first told the server the rehearsal is done. Everything else goes
     * to the beta feedback prompt, which hands off to the results page — except
     * when an admin has set an explicit `quitUrl` on the instance, which still
     * wins because it is a deliberate override.
     */
    const finishTrialRun = async (): Promise<string> => {
        if (!nextExamId) return '/dashboard';
        try {
            // The instance id is what the gate is keyed on, so resolve it from
            // the exam the student is heading back to.
            const { data } = await api.get(`/exams/${nextExamId}`);
            const instanceId = data?.instances?.[0]?.id;
            if (instanceId) {
                await api.post('/attempts/trial-complete', { examInstanceId: instanceId });
            }
        } catch (err) {
            // Non-fatal: the server-side gate will simply ask them to sit the
            // trial again rather than letting anything through unchecked.
            console.error('Could not record trial completion:', err);
        }
        return `/exams/${nextExamId}/instructions?trial=done`;
    };

    const destinationAfterSubmit = async (redirectUrl?: string): Promise<string> => {
        if (isTrialRun) return finishTrialRun();
        if (redirectUrl) return redirectUrl;
        // The beta feedback prompt still comes first — it is asked while the exam
        // is fresh — and hands off to the submitted page, which answers the
        // questions a student actually has at that moment.
        return `/feedback/exam?next=${encodeURIComponent(`/exams/${id}/submitted`)}`;
    };
    useEffect(() => { destinationRef.current = destinationAfterSubmit; });

    const handleSubmit = async () => {
        setIsSubmitting(true);
        // Same reason as the reload button: navigating away drops fullscreen,
        // and a student pressing Submit must not be charged a violation for it.
        suspendViolations();
        stopProctoring();
        clearViolationStorage();
        // Deliberate exit — drop the beforeunload prompt and the re-entry
        // marker, or the student's own Submit would trip the lockdown.
        releaseLockdown();
        try {
            const result = await submitExam();
            window.location.href = await destinationAfterSubmit(result?.redirectUrl);
        } catch {
            window.location.href = isTrialRun ? '/dashboard' : '/feedback/exam';
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
    const unansweredCount = questions.length - answeredCount;
    const allAnswered = questions.length > 0 && unansweredCount === 0;
    /** Where "go to the first blank one" sends them, from the paper itself
     *  rather than from the answer count — a student may have answered 49 of 50
     *  with the blank one in the middle. */
    const firstUnansweredIndex = questions.findIndex((q) => !answers[q.id]);

    // Section structure. The paper is sat one section at a time — all of
    // "Entrepreneurship Mindset", then all of "Problem Solving & Innovation" —
    // and the student is told which one they are in and how far through it they
    // are. Navigation still runs straight through the boundaries; sections are
    // signposting, not gates.
    const sectionBlocks = useMemo(() => groupBySection(questions), [questions]);
    const hasSections = sectionBlocks.length > 0 && Boolean(sectionBlocks[0].title);
    const currentSectionIdx = sectionBlocks.findIndex((b) => b.indices.includes(currentIndex));
    const currentSection = currentSectionIdx >= 0 ? sectionBlocks[currentSectionIdx] : null;
    const positionInSection = currentSection
        ? currentSection.indices.indexOf(currentIndex) + 1
        : currentIndex + 1;

    if (error === 'FACE_ENROLLMENT_REQUIRED') {
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '500px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🪪</div>
                    <h2 style={{ marginBottom: '1rem' }}>Face Enrollment Required</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        This is a proctored exam, you need to enroll your face before you can start it. It only takes a few seconds.
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
                        exam, the practice paper stays free.
                    </p>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => window.location.href = '/unlock'}>
                        Unlock All Exams
                    </button>
                </div>
            </div>
        );
    }

    /**
     * Parental consent is missing (registration part 2).
     *
     * Reached by a student who registered before the parent section existed, or
     * whose consent version has been superseded. `?next=` brings them straight
     * back here once it is done, rather than dropping them on the dashboard to
     * find their own way back to the paper they were trying to sit.
     */
    if (error === 'GUARDIAN_CONSENT_REQUIRED') {
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '520px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👨‍👩‍👧</div>
                    <h2 style={{ marginBottom: '1rem' }}>Parent consent needed first</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Every participant is a school ward, so a parent or guardian has to give
                        consent before we can proctor an exam. It takes about two minutes and only
                        needs doing once.
                    </p>
                    <button
                        className="btn btn-primary"
                        style={{ marginTop: '1.5rem' }}
                        onClick={() => { window.location.href = `/guardian?next=/exams/${id}/instructions`; }}
                    >
                        Complete the parent section
                    </button>
                </div>
            </div>
        );
    }

    /**
     * The paper is over and the student has arrived back at it anyway — almost
     * always the browser Back button, from the feedback or results page.
     *
     * The server has always refused this (`startAttempt` throws once the attempt
     * is no longer IN_PROGRESS, so no second sitting was ever possible), but the
     * refusal landed in the generic handler below under the heading "Failed to
     * Load Exam" — which reads as a bug in the site rather than the rule working,
     * and is exactly what makes students try again. Say plainly that it is
     * closed, and why.
     */
    if (error && /already completed/i.test(error)) {
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '520px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h2 style={{ marginBottom: '1rem' }}>This exam is closed</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        You have already sat this paper. An exam can only be attempted once, so it
                        cannot be reopened, going back to this page will not start it again.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                        Your answers were saved and submitted. Your result will appear under Results
                        once marking is complete.
                    </p>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => window.location.href = '/results'}>
                        Go to My Results
                    </button>
                </div>
            </div>
        );
    }

    /**
     * Anything else that stopped the paper loading.
     *
     * Most of what lands here is a dropped connection — a school Wi-Fi blip, or
     * the backend restarting — and the only thing offered was "Go to Dashboard",
     * which abandons an attempt that is very probably fine. Retrying is the
     * obvious first move and is now the primary action; it re-runs `startExam`,
     * which resumes the existing attempt rather than starting a new one.
     */
    if (error) {
        const looksTransient = /network|timeout|failed to fetch|econn/i.test(error);
        return (
            <div className="container page-content flex items-center justify-center" style={{ minHeight: '100vh' }}>
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '520px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{looksTransient ? '📡' : '⚠️'}</div>
                    <h2 style={{ marginBottom: '1rem' }}>
                        {looksTransient ? 'Could not reach the exam server' : 'Failed to load exam'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {looksTransient
                            ? 'This is almost always a brief internet problem. Your exam has not been lost, check your connection and try again.'
                            : error}
                    </p>
                    {looksTransient && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
                            {error}
                        </p>
                    )}
                    <button
                        className="btn btn-primary"
                        style={{ marginTop: '1.5rem', width: '100%' }}
                        onClick={() => { void startExam().catch(() => { /* error state re-renders */ }); }}
                    >
                        ↻ Try again
                    </button>
                    <button
                        className="btn btn-secondary"
                        style={{ marginTop: '0.5rem', width: '100%' }}
                        onClick={() => window.location.href = '/dashboard'}
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Questions are not here yet. Same screen as the readiness gate below rather
    // than a bare spinner, so the student sees one continuous "getting ready"
    // step list instead of a naked spinner that swaps for a different screen the
    // moment the paper lands.
    if (!currentQuestion) {
        return (
            <ExamPreparingOverlay
                steps={prepareSteps}
                startedAt={prepareStartedAtRef.current}
                // Once preparation is done, the attempt is being created and the
                // clock genuinely has started — so stop showing a countdown.
                phase={isPrepared ? 'starting' : 'preparing'}
                onReady={markPrepared}
            />
        );
    }

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            {/* Limon's tour of the exam screen — **trial runs only**.
                Never on a real paper: the clock is running, and stopping a
                student to explain a button they are already pressing costs them
                marks. This is the whole argument for the rehearsal being free
                and unlimited. Held until the paper is on screen and the student
                is actually in it, so no step points at a target behind the
                fullscreen gate. */}
            {isTrialRun && (
                <LimonTour tourId="exam" ready={Boolean(currentQuestion) && !isGated} />
            )}
            <div className="exam-player">

                {/* ── face-api.js model loading banner ──
                    Only ever seen if the models were still loading when the
                    preparing screen hit its ceiling. The full "getting ready"
                    screen lives in the `!currentQuestion` branch above: the
                    paper cannot exist before preparation finishes now, because
                    preparation is what triggers the attempt being created. */}
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

                {/* ── Limon's timer checks (30 / 60 / 90%, then the 3-minute warning) ──
                    Rendered before the blocking overlays below so it can never sit
                    on top of the fullscreen gate or the auto-submit notice, both of
                    which are terminal and must not be obscured by a pep talk. */}
                {activeCue && (
                    <MascotToast
                        cue={activeCue}
                        answeredCount={Object.keys(answers).length}
                        totalQuestions={questions.length}
                        remainingSeconds={remaining}
                        onDismiss={dismissCue}
                    />
                )}

                {/* ── Violation warning ──
                    The titled explanation the counter alone never gave. Shown for
                    every non-final violation; the final one is handled by the
                    terminal notice instead, which supersedes it. */}
                {visibleViolation && (
                    <ViolationBanner
                        kind={visibleViolation.kind}
                        count={visibleViolation.count}
                        threshold={VIOLATION_REVIEW_THRESHOLD}
                        onDismiss={() => setDismissedViolationAt(visibleViolation.at)}
                    />
                )}

                {/* ── Blocked action notice ──
                    Something the lockdown stopped before it took effect (Back,
                    F5, right-click). No strike was taken — nothing was gained by
                    it — so this explains rather than warns. */}
                {blockedNotice && (
                    <div className="exam-blocked-notice" role="status">
                        <span className="exam-blocked-notice__icon" aria-hidden="true">🔒</span>
                        <span>{BLOCKED_ACTION_COPY[blockedNotice.action]}</span>
                        <button
                            type="button"
                            onClick={() => setBlockedNotice(null)}
                            aria-label="Dismiss"
                            className="exam-blocked-notice__close"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* ── Reload / back actually happened ──
                    Not fatal any more, so this reassures rather than warns:
                    the paper is intact and the student can carry on. */}
                {breachNotice && (
                    <div className="exam-blocked-notice exam-blocked-notice--breach" role="status">
                        <span className="exam-blocked-notice__icon" aria-hidden="true">↻</span>
                        <span>{BREACH_COPY[breachNotice.breach]}</span>
                        <button
                            type="button"
                            onClick={() => setBreachNotice(null)}
                            aria-label="Dismiss"
                            className="exam-blocked-notice__close"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* ── Face-check notice ──
                    Bottom-left, and at most one per cooldown. Used to be a
                    full-screen black backdrop with an OK button the student had
                    to click before they could touch the paper again; now it just
                    tells them, out of the way of the question. */}
                {faceToast && (
                    <ProctorToast
                        data={faceToast}
                        position="bottom-left"
                        onDismiss={() => setFaceToast(null)}
                    />
                )}

                {/* ── Photo-capture confirmation, and the idle nudge ──
                    Top-left. A photo being taken of them is the more
                    consequential of the two things, so it sits where the eye
                    goes first rather than in the corner. */}
                {statusToast && (
                    <ProctorToast
                        data={statusToast}
                        position="top-left"
                        onDismiss={() => {
                            setStatusToast(null);
                            // Dismissing is input. Without this the idle clock
                            // is untouched, so the nudge reappears on the very
                            // next tick after the student closes it.
                            markStudentActive();
                        }}
                    />
                )}

                {/* ── Screen-capture mask ──
                    Above everything. A screenshot already taken cannot be
                    recalled, but every one after it captures this instead of the
                    paper, and the student is told the attempt was recorded. */}
                {isMasked && (
                    <div className="exam-capture-mask" role="alert">
                        <div className="exam-capture-mask__icon" aria-hidden="true">📷</div>
                        <h2>Screen capture is not allowed</h2>
                        <p>
                            Screenshots, screen recordings and printing are not permitted during the
                            exam. This attempt has been recorded and counted as a violation.
                        </p>
                    </div>
                )}

                {/* ── Auto-submit / lock notice ──
                    Sits above the fullscreen gate (higher z-index) because it is
                    terminal: once the exam is ending, the "re-enter fullscreen"
                    affordance underneath is no longer the right thing to offer.
                    A failure here used to be invisible — logged to the console and
                    nowhere else — which is what made an auto-submit that did not
                    land look like the counter was broken. */}
                {autoSubmit && (
                    <AutoSubmitNotice
                        state={autoSubmit}
                        pauseSeconds={PAUSE_TIMEOUT_SEC}
                        onRetry={() => void runAutoSubmit(autoSubmit.cause, autoSubmit.violation, true)}
                        onContinue={continueAfterAutoSubmit}
                        onWarningElapsed={() => void runAutoSubmit(autoSubmit.cause, autoSubmit.violation)}
                    />
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
                            {/* The gate now names the rule that was broken rather
                                than saying "Violation 2 of 3" and leaving the
                                student to guess which of six rules they hit. */}
                            <h2 style={{ marginBottom: '0.75rem' }}>
                                {violationCount === 0
                                    ? 'Fullscreen Required'
                                    : lastViolation
                                        ? violationCopy(lastViolation.kind).title
                                        : isFullscreen ? 'Exam Paused' : 'Return to Fullscreen'}
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                {violationCount === 0
                                    ? 'This exam must be taken in fullscreen mode. Click below to begin, your camera will activate automatically.'
                                    : lastViolation
                                        ? violationCopy(lastViolation.kind).what
                                        : isFullscreen
                                            ? 'Your exam is paused. Click below to resume.'
                                            : 'Re-enter fullscreen to continue your exam.'}
                            </p>
                            {violationCount > 0 && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                    {violationConsequence(violationCount, VIOLATION_REVIEW_THRESHOLD)}
                                </p>
                            )}
                            {/* A live countdown, not a static sentence. The old copy
                                promised an auto-submit "within 20 seconds" with nothing
                                ticking, which reads exactly like a timer that is not
                                running — and gave the student no idea how long they had. */}
                            {violationCount > 0 && pauseSecondsLeft !== null && (
                                <p style={{
                                    color: pauseSecondsLeft <= 5 ? 'var(--danger-400)' : 'var(--warning-400)',
                                    fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem',
                                }}>
                                    Auto-submitting in {pauseSecondsLeft}s
                                </p>
                            )}
                            {violationCount > 0 && pauseSecondsLeft === null && (
                                <p style={{ color: 'var(--danger-400)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                                    Exam will auto-submit if fullscreen is not restored in time.
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
                        {/* "Mention of Specific Grade olympiad during exam" — the
                            grade is stated on the paper itself, not just on the way
                            in, so a student who suspects they are on the wrong paper
                            can see it at any moment without leaving the exam. */}
                        <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
                            {user?.classBand ? (
                                <>
                                    <span className="exam-header__grade">Grade {user.classBand} Olympiad</span>
                                    <span className="exam-header__sep"> · </span>
                                </>
                            ) : null}
                            {exam?.title || 'Exam'}
                        </h2>
                        {/* The rehearsal runs in exactly the same environment as the
                            real paper — fullscreen, webcam, timer, the lot — so the
                            only thing distinguishing it is saying so. */}
                        {isTrialRun && (
                            <span className="badge badge-warning" title="Practice run, this is not scored">
                                Trial test, not scored
                            </span>
                        )}
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
                        <div data-limon="exam-violations" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <div
                                className="violation-badge"
                                style={{
                                    color: violationCount === 0 ? 'var(--text-secondary)' : 'var(--danger-400)',
                                    background: violationCount === 0 ? 'rgba(148,163,184,0.08)' : 'rgba(239,68,68,0.1)',
                                    borderColor: violationCount === 0 ? 'var(--border-subtle)' : 'rgba(239,68,68,0.3)',
                                }}
                            >
                                {/* A bare count, not "2 / 3". The denominator
                                    was a promise that the third one ends the
                                    paper, and nothing does that any more. */}
                                ⚠️ {violationCount}
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
                                    width: '320px', maxHeight: '60vh', overflowY: 'auto',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                                    borderRadius: '10px', padding: '0.85rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                                    fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                                }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>What gets counted here</strong>
                                    <ul style={{ margin: '0.5rem 0 0.5rem 1rem', padding: 0 }}>
                                        <li>Leaving fullscreen, or switching to another tab, window or app</li>
                                        <li>Your face not visible, someone else in the picture, or a face that is not yours</li>
                                        <li>Looking away from the screen for a long stretch</li>
                                        <li>Taking a screenshot, or printing the paper</li>
                                        <li>Refreshing the page, or using the browser Back button</li>
                                    </ul>
                                    <strong style={{ color: 'var(--text-primary)' }}>This number does not end your exam.</strong>{' '}
                                    It is a record. Past {VIOLATION_REVIEW_THRESHOLD}, a person reads what was recorded before
                                    your result is confirmed, and most of what lands here is an ordinary interruption.
                                    <br /><br />
                                    <strong style={{ color: 'var(--text-primary)' }}>What does end your exam</strong>
                                    <br />
                                    Only two things: your time running out, or leaving fullscreen or
                                    switching away and not coming back within {PAUSE_TIMEOUT_SEC} seconds. A
                                    countdown shows you exactly how long you have.
                                    <br /><br />
                                    <strong style={{ color: 'var(--text-primary)' }}>Does not count at all</strong>
                                    <br />
                                    Sitting still. If nothing moves for {EXAM_IDLE_NUDGE_SEC} seconds Limon checks you are
                                    still there, but reading and thinking are not against the rules.
                                </div>
                            )}
                        </div>
                        {/* The only sanctioned way to refresh the paper.
                            F5, Ctrl+R and the browser's own reload button all end
                            the exam now, so there has to be one route that does
                            not — a stuck image or a dropped socket is a real
                            reason to reload and must not cost a student their
                            olympiad. It keeps the attempt, the answers and the
                            server-side timer; only the page is rebuilt. */}
                        <button
                            type="button"
                            className="exam-reload-btn"
                            data-limon="exam-reload"
                            onClick={() => setShowReloadConfirm(true)}
                            disabled={isSubmitting}
                            title="Reload the exam page safely, your answers and timer are kept"
                        >
                            ↻ Reload
                        </button>
                        <div className={`timer-display ${timerClass}`} data-limon="exam-timer">
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
                    {/* Which section this question belongs to, and how far through
                        it the student is. Sits above the card so it reads as a
                        heading for the block rather than part of the question. */}
                    {hasSections && currentSection && (
                        <div className="exam-section-banner">
                            <div className="exam-section-banner-main">
                                <span className="exam-section-eyebrow">
                                    Section {currentSectionIdx + 1} of {sectionBlocks.length}
                                </span>
                                <h2 className="exam-section-title">{currentSection.title}</h2>
                            </div>
                            <span className="exam-section-progress">
                                Question {positionInSection} of {currentSection.indices.length}
                            </span>
                        </div>
                    )}

                    <div className="question-container animate-fade-in" key={currentQuestion.id} data-limon="exam-question">
                        <div className="question-header">
                            {/* The finer topic grouping from the question bank —
                                context for the question, not a section boundary. */}
                            <div className="question-topic">
                                {currentQuestion.sectionName || currentQuestion.topic || ''}
                            </div>
                        </div>

                        <div className="question-text">
                            <p>{currentQuestion.text}</p>

                            {/* A question can carry a picture AND a video at once, so these
                                are independent slots rather than one switched-on media type.
                                Each is wrapped so a URL that fails to load renders an
                                explanation and a retry rather than a browser broken-image
                                glyph — a student mid-exam cannot tell those apart, and an
                                image-based question with no visible image is unanswerable. */}
                            {currentQuestion.imageUrl && (
                                <QuestionImage src={currentQuestion.imageUrl} alt="Question illustration" />
                            )}
                            {currentQuestion.videoUrl && (
                                <QuestionVideo src={currentQuestion.videoUrl} />
                            )}

                            {/* Legacy single-media questions authored before the split. */}
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'IMAGE' && (
                                <QuestionImage src={currentQuestion.mediaUrl} alt="Question media" />
                            )}
                            {currentQuestion.mediaUrl && currentQuestion.mediaType === 'VIDEO' && (
                                <QuestionVideo src={currentQuestion.mediaUrl} />
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

                        <div className="question-nav" data-limon="exam-nav">
                            <button className="btn btn-secondary" disabled={currentIndex === 0 || isGated} onClick={prevQuestion}>← Previous</button>
                            <button className="btn btn-secondary" disabled={isGated} onClick={() => { setSelectedOption(null); if (currentQuestion) saveAnswer(currentQuestion.id, null); }}>Clear</button>
                            <button
                                data-limon="exam-flag"
                                className={`btn ${flagged.has(currentQuestion.id) ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => !isGated && toggleFlag(currentQuestion.id)}
                                disabled={isGated}
                            >
                                {flagged.has(currentQuestion.id) ? '🔖 Marked' : '🔖 Mark for later'}
                            </button>
                            {currentIndex < questions.length - 1 ? (
                                <button className="btn btn-primary" onClick={nextQuestion} disabled={isGated}>Next →</button>
                            ) : (
                                <button className="btn btn-primary" onClick={() => setShowSubmitConfirm(true)} disabled={isGated}>Submit Exam ✓</button>
                            )}
                        </div>
                    </div>

                    <div className="progress-section">
                        <div className="flex justify-between" style={{ fontSize: '0.8rem', color: allAnswered ? 'var(--success-400)' : 'var(--text-muted)', marginBottom: '4px' }}>
                            <span>
                                {allAnswered
                                    ? `✓ All ${questions.length} questions answered`
                                    : `${answeredCount} of ${questions.length} answered`}
                            </span>
                            <span>{progressPercent}%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>
                </main>

                {/* ── Sidebar ── */}
                <aside className="exam-sidebar" data-limon="exam-navigator">
                    <h3 style={{ fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>Questions</h3>

                    {/* Grouped by section so the navigator matches the shape of the
                        paper. A flat 1–50 grid gives no clue where one pillar ends
                        and the next begins. Numbering stays global — "question 27"
                        must mean the same thing here as in the header. */}
                    {sectionBlocks.map((block, bi) => {
                        const answeredHere = block.indices.filter((i) => answers[questions[i].id]).length;
                        return (
                            <div key={block.id} className="question-index-section">
                                {hasSections && (
                                    <div className="question-index-section-head">
                                        <span className="question-index-section-title">
                                            {bi + 1}. {block.title}
                                        </span>
                                        <span className="question-index-section-count">
                                            {answeredHere}/{block.indices.length}
                                        </span>
                                    </div>
                                )}
                                <div className="question-index-grid">
                                    {block.indices.map((i) => {
                                        const q = questions[i];
                                        return (
                                            <button
                                                key={q.id}
                                                className={`question-index-item ${i === currentIndex ? 'current' : answers[q.id] ? 'answered' : flagged.has(q.id) ? 'flagged' : ''}`}
                                                onClick={() => !isGated && goToQuestion(i)}
                                                disabled={isGated}
                                                title={block.title ? `${block.title}: question ${i + 1}` : undefined}
                                            >
                                                {i + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    <div className="sidebar-legend">
                        <div><span className="legend-dot current" /> Current</div>
                        <div><span className="legend-dot answered" /> Answered</div>
                        <div><span className="legend-dot flagged" /> Marked for later</div>
                        <div><span className="legend-dot" /> Not Visited</div>
                    </div>

                    <button className="btn btn-danger btn-lg sidebar-submit" data-limon="exam-submit" onClick={() => setShowSubmitConfirm(true)} disabled={isGated}>
                        Submit Exam
                    </button>
                </aside>

                {/* ── Safe Reload Modal ──
                    Confirmed rather than instant, because a reload drops the
                    student back through the fullscreen gate and the camera
                    warm-up, which is disorienting mid-paper if it was a misclick. */}
                {showReloadConfirm && (
                    <div className="modal-overlay">
                        <div className="modal glass-card">
                            <h2>Reload the exam page?</h2>
                            <p>
                                Use this if the page looks wrong: a question image that will not
                                load, or a timer that has stopped moving.
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                                Your answers and your remaining time are kept, the timer runs on our
                                server, not in this page. You will be asked to re-enter fullscreen and
                                your camera will restart.
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--warning-400)', marginTop: '8px' }}>
                                This is the only safe way to reload. Pressing F5 or your browser&apos;s
                                reload button will end and lock your exam.
                            </p>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" onClick={() => setShowReloadConfirm(false)}>Go Back</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        // Reloading tears the document down, which drops
                                        // fullscreen, which fires `fullscreenchange` exactly
                                        // like a student pressing Escape. That was being
                                        // counted — so the safe reload we told them to use
                                        // handed them a fresh page reading "1 / 3".
                                        suspendViolations();
                                        reloadExam();
                                    }}
                                >
                                    Reload safely
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Submit Confirmation Modal ──
                    "Once all questions are answered, the system should indicate
                    this status clearly to the user." A bare "50 of 50" is a
                    number a student has to do arithmetic on under time pressure,
                    and it reads identically to "49 of 50" at a glance. The two
                    cases are now visually different things: a green all-clear, or
                    a warning that names how many are blank and offers a way back
                    to the first of them. */}
                {showSubmitConfirm && (
                    <div className="modal-overlay">
                        <div className="modal glass-card">
                            <h2>Submit Exam?</h2>
                            {allAnswered ? (
                                <div className="submit-status submit-status--complete" role="status">
                                    <span className="submit-status__icon" aria-hidden="true">✓</span>
                                    <div>
                                        <strong>All {questions.length} questions answered.</strong>
                                        <p>You have not left anything blank.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="submit-status submit-status--incomplete" role="status">
                                    <span className="submit-status__icon" aria-hidden="true">!</span>
                                    <div>
                                        <strong>
                                            {unansweredCount} question{unansweredCount === 1 ? '' : 's'} still blank
                                        </strong>
                                        <p>
                                            You have answered {answeredCount} of {questions.length}. There is no
                                            negative marking, so a guess is always better than a blank.
                                        </p>
                                        {firstUnansweredIndex !== -1 && (
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => {
                                                    setShowSubmitConfirm(false);
                                                    goToQuestion(firstUnansweredIndex);
                                                }}
                                            >
                                                Go to question {firstUnansweredIndex + 1}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
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
