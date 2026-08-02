'use client';

/**
 * One face-api.js load per browser session, shared by everything that needs it.
 *
 * The models are the single heaviest thing the exam pulls in — the face
 * recognition net alone is 6.2 MB — and loading them used to happen *inside the
 * exam*, on the play page, in the first seconds of a timed paper. Three things
 * were wrong with that:
 *
 *  1. **It ran on the exam clock.** `startedAt` is stamped server-side the
 *     moment the attempt begins, so every second spent fetching weights was a
 *     second of the student's paper.
 *
 *  2. **It ran more than once.** The old guard was a `useRef` inside
 *     `useFaceProctor`, which is per hook instance. Enrollment on /profile, the
 *     instructions page and the player each got their own, and each re-parsed
 *     the weights into fresh GPU tensors.
 *
 *  3. **The first inference stalled the main thread anyway.** Loading weights is
 *     not the same as being ready to run: the first `detectAllFaces` call
 *     compiles the WebGL shaders and allocates the tensor workspace, which is a
 *     visible freeze of a second or more. That is the lag students felt as the
 *     paper "sticking" right after it opened — and it happened *after* loading
 *     appeared to be finished, which is why it looked like the exam itself was
 *     slow.
 *
 * So loading is hoisted to module scope and started early — while the student is
 * reading the rules, when there is no clock running and a few seconds cost
 * nothing. By the time the player mounts the weights are usually already in
 * memory, and {@link warmUpFaceModels} has taken the shader-compilation hit.
 */

type FaceApi = typeof import('face-api.js');

const MODEL_URL = '/models';

/**
 * Relative cost of each net, used to make the progress bar move at a believable
 * rate. Weighted by download size — an unweighted "1 of 3 done" bar sits at 66%
 * for almost the entire load, because the recognition net is 20× the other two
 * put together.
 */
const NET_WEIGHTS = { detector: 0.03, landmarks: 0.02, recognition: 0.95 };

export type FaceModelProgress = {
    /** 0–1, weighted by download size. */
    ratio: number;
    /** Something short enough for a status line. */
    label: string;
};

type ProgressListener = (progress: FaceModelProgress) => void;

let loadPromise: Promise<FaceApi> | null = null;
let loadedApi: FaceApi | null = null;
let warmedUp = false;
let currentProgress: FaceModelProgress = { ratio: 0, label: 'Preparing proctoring…' };
const listeners = new Set<ProgressListener>();

function publish(ratio: number, label: string) {
    currentProgress = { ratio: Math.min(1, ratio), label };
    listeners.forEach((fn) => fn(currentProgress));
}

/** Subscribe to load progress. Fires immediately with the current value. */
export function onFaceModelProgress(fn: ProgressListener): () => void {
    listeners.add(fn);
    fn(currentProgress);
    return () => { listeners.delete(fn); };
}

export function faceModelsReady(): boolean {
    return loadedApi !== null;
}

export function faceModelsWarm(): boolean {
    return warmedUp;
}

export function getFaceApi(): FaceApi | null {
    return loadedApi;
}

/**
 * Loads the models, or returns the in-flight/finished load.
 *
 * Safe to call from anywhere, as often as you like — the first caller does the
 * work and everyone else awaits the same promise. Call it as early as you
 * plausibly can; the instructions page is the right place, because the student
 * spends real time reading there.
 */
export function preloadFaceModels(): Promise<FaceApi> {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        publish(0, 'Loading proctoring models…');

        const faceapi = await import('face-api.js');

        let done = 0;
        const track = (weight: number, name: string) => (p: Promise<unknown>) =>
            p.then((v) => {
                done += weight;
                publish(done, `Loaded ${name}`);
                return v;
            });

        await Promise.all([
            track(NET_WEIGHTS.detector, 'face detector')(
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            ),
            track(NET_WEIGHTS.landmarks, 'facial landmarks')(
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            ),
            track(NET_WEIGHTS.recognition, 'identity model')(
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ),
        ]);

        loadedApi = faceapi;
        publish(1, 'Proctoring ready');
        return faceapi;
    })();

    loadPromise.catch(() => {
        // Let a failed load be retried rather than caching the rejection
        // forever — a dropped connection on the instructions page must not
        // leave the student unable to start the exam at all.
        loadPromise = null;
        publish(0, 'Could not load proctoring models');
    });

    return loadPromise;
}

/**
 * Runs one throwaway inference so the exam does not pay for the first one.
 *
 * The stall this removes is TensorFlow.js compiling its WebGL shader programs
 * and allocating the tensor workspace, which happens on the first real
 * `detectAllFaces` call and nowhere earlier. Loading the weights does not
 * trigger it. Doing it here, behind the "preparing your exam" screen, is the
 * difference between a paper that opens smooth and one that freezes on the
 * first question.
 *
 * Never throws: a warm-up that fails is a slightly slower first detection, not
 * a reason to stop a student sitting their exam.
 */
export async function warmUpFaceModels(video: HTMLVideoElement | null): Promise<void> {
    if (warmedUp) return;
    const faceapi = loadedApi;
    if (!faceapi || !video || video.readyState < 2) return;

    try {
        await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks(true)
            .withFaceDescriptor();
        warmedUp = true;
    } catch {
        // Shaders may still have compiled; either way this is best-effort.
        warmedUp = true;
    }
}
