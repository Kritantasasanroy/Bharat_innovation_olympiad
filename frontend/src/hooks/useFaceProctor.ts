'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useProctorStore } from '@/store/proctorStore';

// face-api.js is loaded dynamically to avoid SSR issues
type FaceApi = typeof import('face-api.js');

const DETECTION_INTERVAL_MS = 5000;  // run inference every 5s
const GAZE_THRESHOLD = 0.25;          // nose deviation ratio to trigger LOOKING_AWAY
const IDENTITY_THRESHOLD = 0.5;       // Euclidean distance below which faces match

// ── Sustained-issue tracking ──
// Real inference only runs every 5s, but "sustained for N seconds" needs finer
// resolution than that. A lightweight 1s timer (no model inference, just
// Date.now() comparisons against timestamps set by the real detection tick)
// checks whether the LAST KNOWN state has persisted long enough to count.
const SUSTAIN_CHECK_INTERVAL_MS = 1000;
const NO_FACE_SUSTAIN_MS = 5000;       // face must be missing continuously for >5s
const LOOKING_AWAY_SUSTAIN_MS = 3000;  // gaze must be away continuously for >=3s
const SUB_EVENTS_PER_VIOLATION = 2;    // 2 sustained occurrences = 1 counted violation

interface UseFaceProctorOptions {
    attemptId: string;
    disabled?: boolean;
    // Fired once per SUB_EVENTS_PER_VIOLATION sustained occurrences — only
    // meaningful during an exam. Wire this into the same violation counter
    // that fullscreen/tab-switch violations use.
    onSustainedViolation?: (type: 'NO_FACE' | 'LOOKING_AWAY') => void;
}

interface FaceProctorState {
    isLoaded: boolean;
    loadingProgress: string;
    currentFaceCount: number;
    isIdentityVerified: boolean | null; // null = not checked yet
    noFaceSince: number | null;  // epoch ms since face went missing, null if present
    awaySince: number | null;    // epoch ms since gaze registered "away", null if forward/no-face
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
 */
export function useFaceProctor({
    attemptId,
    disabled = false,
    onSustainedViolation,
}: UseFaceProctorOptions) {
    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sustainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const faceApiRef = useRef<FaceApi | null>(null);
    const enrolledDescriptorRef = useRef<Float32Array | null>(null);

    const onSustainedViolationRef = useRef(onSustainedViolation);
    useEffect(() => { onSustainedViolationRef.current = onSustainedViolation; });

    // Timestamps set by the real 5s detection tick; read by the 1s sustain checker.
    const noFaceSinceRef = useRef<number | null>(null);
    const awaySinceRef = useRef<number | null>(null);
    const noFaceSubFiredRef = useRef(false);
    const awaySubFiredRef = useRef(false);
    const noFaceSubCountRef = useRef(0);
    const awaySubCountRef = useRef(0);

    const { setWebcamStream, setDeviceCheck } = useProctorStore();

    const [state, setState] = useState<FaceProctorState>({
        isLoaded: false,
        loadingProgress: '',
        currentFaceCount: 0,
        isIdentityVerified: null,
        noFaceSince: null,
        awaySince: null,
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
                video: { width: 320, height: 240, facingMode: 'user' },
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
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks(true)
                .withFaceDescriptors();

            const faceCount = detections.length;
            setState((s) => ({ ...s, currentFaceCount: faceCount }));

            if (faceCount === 0) {
                if (!noFaceSinceRef.current) noFaceSinceRef.current = Date.now();
                // Can't assess gaze without a face — clear that tracker.
                awaySinceRef.current = null;
                awaySubFiredRef.current = false;
                await postEvent('NO_FACE', { source: 'face-api.js' });
                return;
            }

            // Face is present again — reset the no-face tracker.
            noFaceSinceRef.current = null;
            noFaceSubFiredRef.current = false;

            if (faceCount > 1) {
                await postEvent('MULTIPLE_FACES', { faceCount, source: 'face-api.js' });
            }

            // Use the first (primary) face for gaze + identity checks
            const primary = detections[0];

            // Gaze estimation
            const gaze = estimateGaze(primary.landmarks);
            if (gaze === 'away') {
                if (!awaySinceRef.current) awaySinceRef.current = Date.now();
                await postEvent('LOOKING_AWAY', { source: 'face-api.js' });
            } else {
                awaySinceRef.current = null;
                awaySubFiredRef.current = false;
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
                    await postEvent('FACE_MISMATCH', {
                        distance: parseFloat(distance.toFixed(3)),
                        source: 'face-api.js',
                    });
                }
            }
        } catch {
            // Inference errors are non-fatal
        }
    }, [disabled, postEvent]);

    // Runs every 1s — no model inference, just checks how long the LAST KNOWN
    // state (set by runDetection above) has persisted, and fires a paired
    // violation once SUB_EVENTS_PER_VIOLATION sustained occurrences happen.
    const checkSustained = useCallback(() => {
        const now = Date.now();

        if (noFaceSinceRef.current && !noFaceSubFiredRef.current) {
            if (now - noFaceSinceRef.current >= NO_FACE_SUSTAIN_MS) {
                noFaceSubFiredRef.current = true;
                noFaceSubCountRef.current += 1;
                if (noFaceSubCountRef.current >= SUB_EVENTS_PER_VIOLATION) {
                    noFaceSubCountRef.current = 0;
                    onSustainedViolationRef.current?.('NO_FACE');
                }
            }
        }

        if (awaySinceRef.current && !awaySubFiredRef.current) {
            if (now - awaySinceRef.current >= LOOKING_AWAY_SUSTAIN_MS) {
                awaySubFiredRef.current = true;
                awaySubCountRef.current += 1;
                if (awaySubCountRef.current >= SUB_EVENTS_PER_VIOLATION) {
                    awaySubCountRef.current = 0;
                    onSustainedViolationRef.current?.('LOOKING_AWAY');
                }
            }
        }

        setState((s) => {
            if (s.noFaceSince === noFaceSinceRef.current && s.awaySince === awaySinceRef.current) return s;
            return { ...s, noFaceSince: noFaceSinceRef.current, awaySince: awaySinceRef.current };
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
        noFaceSinceRef.current = null;
        awaySinceRef.current = null;
        noFaceSubFiredRef.current = false;
        awaySubFiredRef.current = false;
        noFaceSubCountRef.current = 0;
        awaySubCountRef.current = 0;
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
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
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
