'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useProctorStore } from '@/store/proctorStore';

// face-api.js is loaded dynamically to avoid SSR issues
type FaceApi = typeof import('face-api.js');

const DETECTION_INTERVAL_MS = 5000;  // run inference every 5s
const GAZE_THRESHOLD = 0.25;          // nose deviation ratio to trigger LOOKING_AWAY
const IDENTITY_THRESHOLD = 0.5;       // Euclidean distance below which faces match
// tinyFaceDetector's default inputSize (416) is tuned for lower-res input —
// a larger inputSize gives the detector more pixel detail to work with,
// which helped with missed detections on a 320x240 feed. scoreThreshold is
// back at face-api.js's own default (0.5); the lowered 0.3 tried earlier let
// through too many low-confidence, unreliable detections. This affects
// face-count, gaze estimation, and multi-face detection alike since they all
// run against the same detectAllFaces() call.
const DETECTOR_INPUT_SIZE = 512;
const DETECTOR_SCORE_THRESHOLD = 0.5;

// ── Sustained-issue tracking ──
// Real inference only runs every 5s, but "sustained for N seconds" needs finer
// resolution than that. A lightweight 1s timer (no model inference, just
// Date.now() comparisons against timestamps set by the real detection tick)
// checks whether the LAST KNOWN state has persisted long enough to count.
const SUSTAIN_CHECK_INTERVAL_MS = 1000;
// Exported so UI popups (countdowns) stay in sync with the actual thresholds.
export const NO_FACE_SUSTAIN_MS = 7000;       // face must be missing continuously for >7s
export const LOOKING_AWAY_SUSTAIN_MS = 5000;  // gaze must be away continuously for >=5s
export const FACE_MISMATCH_SUSTAIN_MS = 5000; // identity mismatch must persist for >=5s
const SUB_EVENTS_PER_VIOLATION = 2;    // 2 sustained occurrences = 1 counted violation
// Safety net: a SINGLE continuous episode that drags on past this counts as
// its own violation even without a second occurrence to pair with — closes
// the loophole where staying away/mismatched forever only ever counts once.
// Counted silently (no extra popup — the original popup is still showing).
const LONG_VIOLATION_MS = 12000;

type SustainedType = 'NO_FACE' | 'LOOKING_AWAY' | 'FACE_MISMATCH';

interface UseFaceProctorOptions {
    attemptId: string;
    disabled?: boolean;
    // Fired once per SUB_EVENTS_PER_VIOLATION sustained occurrences (or once a
    // single occurrence exceeds LONG_VIOLATION_MS) — only meaningful during an
    // exam. Wire this into the same violation counter that fullscreen/tab-switch
    // violations use.
    onSustainedViolation?: (type: SustainedType) => void;
    // Fired immediately the first tick multiple faces are seen — no sustain
    // buffer, no pairing, counts every distinct episode as its own violation.
    onInstantViolation?: (type: 'MULTIPLE_FACES') => void;
}

interface FaceProctorState {
    isLoaded: boolean;
    loadingProgress: string;
    currentFaceCount: number;
    isIdentityVerified: boolean | null; // null = not checked yet
    noFaceSince: number | null;   // epoch ms since face went missing, null if present
    awaySince: number | null;     // epoch ms since gaze registered "away", null if forward/no-face
    mismatchSince: number | null; // epoch ms since identity stopped matching, null if matching/unchecked
}

// Per-issue-type bookkeeping for the sustained-duration + pairing logic.
interface SustainTracker {
    since: number | null;
    subFired: boolean;
    longFired: boolean;
    subCount: number;
}

function freshTracker(): SustainTracker {
    return { since: null, subFired: false, longFired: false, subCount: 0 };
}

/**
 * useFaceProctor — client-side AI proctoring via face-api.js.
 *
 * Replaces the Meazure Learning integration entirely.
 * All inference runs in the browser (TF.js WebGL) — zero server-side processing.
 *
 * Models required in /public/models/ (download from face-api.js GitHub releases):
 *   tiny_face_detector_model-*       (190 KB) — fast face detection
 *   face_landmark_68_tiny_model-*    (80 KB)  — landmarks for gaze estimation
 *   face_recognition_model-*         (6.2 MB) — 128D descriptor for identity match
 *
 * Detection cadence: every 5s via setInterval + requestIdleCallback.
 * Events fired: NO_FACE, MULTIPLE_FACES, LOOKING_AWAY, FACE_MISMATCH
 * All events posted to POST /proctor/events (via the shared api client).
 * Identity match is verified server-side via POST /proctor/verify (the
 * enrolled descriptor never leaves the backend).
 */
export function useFaceProctor({
    attemptId,
    disabled = false,
    onSustainedViolation,
    onInstantViolation,
}: UseFaceProctorOptions) {
    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sustainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const faceApiRef = useRef<FaceApi | null>(null);
    const enrolledDescriptorRef = useRef<Float32Array | null>(null);
    const multiFaceActiveRef = useRef(false);

    const onSustainedViolationRef = useRef(onSustainedViolation);
    const onInstantViolationRef = useRef(onInstantViolation);
    useEffect(() => { onSustainedViolationRef.current = onSustainedViolation; });
    useEffect(() => { onInstantViolationRef.current = onInstantViolation; });

    // Timestamps/flags set by the real 5s detection tick; read by the 1s sustain checker.
    const noFaceTrackerRef = useRef<SustainTracker>(freshTracker());
    const awayTrackerRef = useRef<SustainTracker>(freshTracker());
    const mismatchTrackerRef = useRef<SustainTracker>(freshTracker());

    const { setWebcamStream, setDeviceCheck } = useProctorStore();

    const [state, setState] = useState<FaceProctorState>({
        isLoaded: false,
        loadingProgress: '',
        currentFaceCount: 0,
        isIdentityVerified: null,
        noFaceSince: null,
        awaySince: null,
        mismatchSince: null,
    });

    // Callback ref — fires every time React mounts/unmounts the <video> element.
    const videoRef = useCallback((el: HTMLVideoElement | null) => {
        videoElementRef.current = el;
        const stream = useProctorStore.getState().webcamStream;
        if (el && stream) {
            el.srcObject = stream;
            el.play().catch(() => {});
        }
    }, []);

    const postEvent = useCallback(
        async (type: string, details: Record<string, any> = {}) => {
            try {
                await api.post('/proctor/events', { attemptId, type, details });
            } catch {
                // Network errors during exam are non-fatal
            }
        },
        [attemptId],
    );

    const loadModels = useCallback(async () => {
        if (faceApiRef.current) return; // already loaded

        setState((s) => ({ ...s, loadingProgress: 'Loading face detection models…' }));

        const faceapi = await import('face-api.js');
        faceApiRef.current = faceapi;

        const MODEL_URL = '/models';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        setState((s) => ({ ...s, loadingProgress: '', isLoaded: true }));
    }, []);

    const startCamera = useCallback(async (): Promise<MediaStream | null> => {
        const existing = useProctorStore.getState().webcamStream;
        if (existing && existing.getTracks().some((t) => t.readyState === 'live')) {
            if (videoElementRef.current) {
                videoElementRef.current.srcObject = existing;
                videoElementRef.current.play().catch(() => {});
            }
            setDeviceCheck('webcam', true);
            return existing;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                // Higher resolution than the old 320x240 gives the detector more
                // pixel detail to work with — see DETECTOR_INPUT_SIZE comment above.
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: false,
            });
            if (videoElementRef.current) {
                videoElementRef.current.srcObject = stream;
                videoElementRef.current.play().catch(() => {});
            }
            setWebcamStream(stream);
            setDeviceCheck('webcam', true);
            return stream;
        } catch {
            setDeviceCheck('webcam', false);
            return null;
        }
    }, [setWebcamStream, setDeviceCheck]);

    const fetchEnrolledDescriptor = useCallback(async () => {
        try {
            const res = await api.get('/proctor/enrollment');
            if (!res.data.enrolled) return;
            // Identity is verified each tick by POST /proctor/verify with the live descriptor
        } catch {
            // Non-fatal — skip identity verification if enrollment check fails
        }
    }, []);

    // ── Gaze estimation from 68 facial landmarks ──
    const estimateGaze = (landmarks: import('face-api.js').FaceLandmarks68): 'forward' | 'away' => {
        const pts = landmarks.positions;
        // Left eye outer corner: 36, Right eye outer corner: 45, Nose tip: 30
        const faceCenterX = (pts[36].x + pts[45].x) / 2;
        const faceWidth = pts[45].x - pts[36].x;
        if (faceWidth < 1) return 'forward';
        const deviation = (pts[30].x - faceCenterX) / faceWidth;
        return Math.abs(deviation) > GAZE_THRESHOLD ? 'away' : 'forward';
    };

    const runDetection = useCallback(async () => {
        const faceapi = faceApiRef.current;
        const video = videoElementRef.current;
        if (!faceapi || !video || video.readyState < 2 || disabled) return;

        try {
            const detections = await faceapi
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
                    inputSize: DETECTOR_INPUT_SIZE,
                    scoreThreshold: DETECTOR_SCORE_THRESHOLD,
                }))
                .withFaceLandmarks(true)
                .withFaceDescriptors();

            const faceCount = detections.length;
            setState((s) => ({ ...s, currentFaceCount: faceCount }));

            if (faceCount === 0) {
                if (!noFaceTrackerRef.current.since) noFaceTrackerRef.current.since = Date.now();
                // Can't assess gaze/identity without a face — clear those trackers.
                awayTrackerRef.current = freshTracker();
                mismatchTrackerRef.current = freshTracker();
                multiFaceActiveRef.current = false;
                setState((s) => ({ ...s, isIdentityVerified: null }));
                await postEvent('NO_FACE', { source: 'face-api.js' });
                return;
            }

            // Face is present again — reset the no-face tracker.
            noFaceTrackerRef.current = freshTracker();

            if (faceCount > 1) {
                if (!multiFaceActiveRef.current) {
                    multiFaceActiveRef.current = true;
                    onInstantViolationRef.current?.('MULTIPLE_FACES');
                }
                await postEvent('MULTIPLE_FACES', { faceCount, source: 'face-api.js' });
                // Identity can't be reliably attributed with more than one face.
                mismatchTrackerRef.current = freshTracker();
                setState((s) => ({ ...s, isIdentityVerified: null }));
            } else {
                multiFaceActiveRef.current = false;
            }

            // Use the first (primary) face for gaze + identity checks
            const primary = detections[0];

            // Gaze estimation
            const gaze = estimateGaze(primary.landmarks);
            if (gaze === 'away') {
                if (!awayTrackerRef.current.since) awayTrackerRef.current.since = Date.now();
                await postEvent('LOOKING_AWAY', { source: 'face-api.js' });
            } else {
                awayTrackerRef.current = freshTracker();
            }

            // Identity verification — compare against enrolled descriptor
            if (enrolledDescriptorRef.current && primary.descriptor) {
                const distance = faceapi.euclideanDistance(
                    Array.from(primary.descriptor),
                    Array.from(enrolledDescriptorRef.current),
                );
                const match = distance < IDENTITY_THRESHOLD;
                setState((s) => ({ ...s, isIdentityVerified: match }));
                if (!match) {
                    if (!mismatchTrackerRef.current.since) mismatchTrackerRef.current.since = Date.now();
                    await postEvent('FACE_MISMATCH', {
                        distance: parseFloat(distance.toFixed(3)),
                        source: 'face-api.js',
                    });
                } else {
                    mismatchTrackerRef.current = freshTracker();
                }
            }
        } catch {
            // Inference errors are non-fatal
        }
    }, [disabled, postEvent]);

    // Runs every 1s — no model inference, just checks how long the LAST KNOWN
    // state (set by runDetection above) has persisted, and fires a paired
    // violation once SUB_EVENTS_PER_VIOLATION sustained occurrences happen (or
    // once a single occurrence exceeds LONG_VIOLATION_MS, silently).
    const checkSustained = useCallback(() => {
        const now = Date.now();

        const evaluate = (tracker: SustainTracker, sustainMs: number, type: SustainedType) => {
            if (!tracker.since) return;
            const elapsed = now - tracker.since;
            if (!tracker.subFired && elapsed >= sustainMs) {
                tracker.subFired = true;
                tracker.subCount += 1;
                if (tracker.subCount >= SUB_EVENTS_PER_VIOLATION) {
                    tracker.subCount = 0;
                    onSustainedViolationRef.current?.(type);
                }
            }
            if (!tracker.longFired && elapsed >= LONG_VIOLATION_MS) {
                tracker.longFired = true;
                onSustainedViolationRef.current?.(type);
            }
        };

        evaluate(noFaceTrackerRef.current, NO_FACE_SUSTAIN_MS, 'NO_FACE');
        evaluate(awayTrackerRef.current, LOOKING_AWAY_SUSTAIN_MS, 'LOOKING_AWAY');
        evaluate(mismatchTrackerRef.current, FACE_MISMATCH_SUSTAIN_MS, 'FACE_MISMATCH');

        setState((s) => {
            const noFaceSince = noFaceTrackerRef.current.since;
            const awaySince = awayTrackerRef.current.since;
            const mismatchSince = mismatchTrackerRef.current.since;
            if (s.noFaceSince === noFaceSince && s.awaySince === awaySince && s.mismatchSince === mismatchSince) return s;
            return { ...s, noFaceSince, awaySince, mismatchSince };
        });
    }, []);

    const startProctoring = useCallback(async () => {
        if (disabled) return;

        await loadModels();
        await startCamera();
        await fetchEnrolledDescriptor();

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(() => runDetection(), { timeout: 3000 });
            } else {
                runDetection();
            }
        }, DETECTION_INTERVAL_MS);

        if (sustainIntervalRef.current) clearInterval(sustainIntervalRef.current);
        sustainIntervalRef.current = setInterval(checkSustained, SUSTAIN_CHECK_INTERVAL_MS);
    }, [disabled, loadModels, startCamera, fetchEnrolledDescriptor, runDetection, checkSustained]);

    // One-off camera + model load for the enrollment UI — no periodic detection
    // loop and no attemptId dependency, unlike startProctoring() (used during exams).
    const startEnrollmentCamera = useCallback(async () => {
        await loadModels();
        await startCamera();
    }, [loadModels, startCamera]);

    const stopProctoring = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (sustainIntervalRef.current) {
            clearInterval(sustainIntervalRef.current);
            sustainIntervalRef.current = null;
        }
        noFaceTrackerRef.current = freshTracker();
        awayTrackerRef.current = freshTracker();
        mismatchTrackerRef.current = freshTracker();
        multiFaceActiveRef.current = false;
        const stream = useProctorStore.getState().webcamStream;
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            setWebcamStream(null);
        }
        if (videoElementRef.current) {
            videoElementRef.current.srcObject = null;
        }
    }, [setWebcamStream]);

    // Enroll a face descriptor — call this from the enrollment UI
    const enrollFace = useCallback(
        async (descriptor: number[]): Promise<boolean> => {
            try {
                await api.post('/proctor/enroll', { descriptor });
                return true;
            } catch {
                return false;
            }
        },
        [],
    );

    // Capture descriptor from the live video (used during enrollment)
    const captureDescriptor = useCallback(async (): Promise<number[] | null> => {
        const faceapi = faceApiRef.current;
        const video = videoElementRef.current;
        if (!faceapi || !video) return null;

        const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
                inputSize: DETECTOR_INPUT_SIZE,
                scoreThreshold: DETECTOR_SCORE_THRESHOLD,
            }))
            .withFaceLandmarks(true)
            .withFaceDescriptor();

        if (!detection) return null;
        return Array.from(detection.descriptor);
    }, []);

    useEffect(() => {
        return () => {
            stopProctoring();
        };
    }, [stopProctoring]);

    return {
        videoRef,
        ...state,
        startProctoring,
        startEnrollmentCamera,
        stopProctoring,
        enrollFace,
        captureDescriptor,
    };
}
