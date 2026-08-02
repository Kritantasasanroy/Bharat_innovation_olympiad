'use client';

/**
 * The one place a camera stream is opened, and the one place it is closed.
 *
 * ## The bug this exists to make impossible
 *
 * The camera stayed on after a student finished their exam. Not because nothing
 * tried to stop it — `useFaceProctor.stopProctoring` and `useWebcam.stopWebcam`
 * both did — but because between them they could only ever stop the *one*
 * stream the proctor store happened to be holding, and the exam flow reliably
 * produced more than one:
 *
 *   1. The instructions page opens a stream for the webcam preview and face
 *      enrollment, and puts it in the store.
 *   2. Start Exam navigates client-side. The instructions page unmounts and
 *      `stopWebcam()` runs — but it read the stream off `videoElementRef`, and
 *      React detaches refs *before* it runs passive effect cleanups, so by then
 *      the ref was null. It stopped nothing and cleared the store anyway.
 *   3. The player, finding an empty store, opened a second stream.
 *
 * The first stream was now unreachable by any code in the app, and no amount of
 * calling `stopProctoring()` at submit time could ever turn it off.
 *
 * So ownership does not live with a component, a ref, or the store: this module
 * keeps a registry of every stream it has handed out, and {@link releaseCamera}
 * stops all of them. A stream that cannot be reached is a stream that cannot be
 * released, so nothing else is allowed to call `getUserMedia` directly.
 */

/**
 * Every stream opened in this document and not yet stopped.
 *
 * Module scope, not React state: it has to outlive any component that opened a
 * stream, because the whole failure mode is a component going away while its
 * camera stays on.
 */
const openStreams = new Set<MediaStream>();

/** Opens a camera stream and takes ownership of it. */
export async function openCamera(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    openStreams.add(stream);
    // A track can also end on its own — the device is unplugged, or the OS takes
    // it. Drop it from the registry then, so the set does not grow across a long
    // session with reconnects.
    stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
            if (stream.getTracks().every((t) => t.readyState === 'ended')) {
                openStreams.delete(stream);
            }
        });
    });
    return stream;
}

/** A stream is only usable if something in it is still live. */
export function isStreamLive(stream: MediaStream | null | undefined): boolean {
    return Boolean(stream && stream.getTracks().some((t) => t.readyState === 'live'));
}

/**
 * Turns the camera off — every stream, however it was opened.
 *
 * Safe to call when nothing is running, and safe to call repeatedly: this is the
 * belt-and-braces call the post-exam pages make on mount, so that whatever
 * happened during the paper, a student who has finished is not sitting in front
 * of a lit camera light.
 *
 * Returns how many streams it actually stopped, which is what the tests assert
 * on and what makes a regression here visible rather than silent.
 */
export function releaseCamera(): number {
    let stopped = 0;
    for (const stream of openStreams) {
        for (const track of stream.getTracks()) {
            if (track.readyState === 'live') stopped++;
            track.stop();
        }
    }
    openStreams.clear();
    return stopped;
}

/** How many streams are currently open. Diagnostics and tests only. */
export function openCameraCount(): number {
    return openStreams.size;
}
