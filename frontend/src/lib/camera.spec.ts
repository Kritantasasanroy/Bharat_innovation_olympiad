import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStreamLive, openCamera, openCameraCount, releaseCamera } from './camera';

/**
 * The regression these cover: a student finished their exam and the camera light
 * stayed on.
 *
 * The cause was never "nothing called stop". It was that the exam flow opens the
 * camera more than once — once on the instructions page for the preview and face
 * enrollment, again in the player — and the teardown could only reach whichever
 * single stream the proctor store happened to be holding at the time. The first
 * stream became unreachable, and unreachable means it can never be turned off.
 *
 * So the thing worth testing is not "stop was called" but "*every* stream is
 * stopped, including one nothing is holding a reference to any more".
 */

/** A MediaStream stand-in whose tracks record whether they were stopped. */
function fakeStream(trackCount = 1) {
    const tracks = Array.from({ length: trackCount }, () => {
        const listeners: Record<string, (() => void)[]> = {};
        return {
            readyState: 'live' as 'live' | 'ended',
            stop: vi.fn(function (this: { readyState: string }) {
                this.readyState = 'ended';
            }),
            addEventListener: (event: string, fn: () => void) => {
                (listeners[event] ??= []).push(fn);
            },
            fire: (event: string) => listeners[event]?.forEach((fn) => fn()),
        };
    });
    return { getTracks: () => tracks, tracks } as unknown as MediaStream & {
        tracks: ReturnType<typeof Array.prototype.map>;
    };
}

const mockGetUserMedia = (streams: MediaStream[]) => {
    let i = 0;
    vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn(async () => streams[i++]) },
    });
};

describe('camera registry', () => {
    beforeEach(() => {
        releaseCamera();
        vi.unstubAllGlobals();
    });

    it('stops every open stream, not just the most recent one', async () => {
        const first = fakeStream();
        const second = fakeStream();
        mockGetUserMedia([first, second]);

        // Exactly the exam flow: the instructions page opens one, then the
        // player opens another without the first ever being handed back.
        await openCamera({ video: true });
        await openCamera({ video: true });
        expect(openCameraCount()).toBe(2);

        const stopped = releaseCamera();

        expect(stopped).toBe(2);
        expect(first.tracks[0].stop).toHaveBeenCalled();
        expect(second.tracks[0].stop).toHaveBeenCalled();
        expect(openCameraCount()).toBe(0);
    });

    it('stops every track of a stream, not only the first', async () => {
        const stream = fakeStream(3);
        mockGetUserMedia([stream]);

        await openCamera({ video: true, audio: true });
        releaseCamera();

        stream.tracks.forEach((t: { stop: ReturnType<typeof vi.fn> }) =>
            expect(t.stop).toHaveBeenCalled(),
        );
    });

    it('is safe to call when nothing is open — the post-exam pages call it blind', () => {
        expect(releaseCamera()).toBe(0);
        expect(releaseCamera()).toBe(0);
    });

    it('does not double-count a stream that has already been stopped', async () => {
        mockGetUserMedia([fakeStream()]);
        await openCamera({ video: true });

        expect(releaseCamera()).toBe(1);
        expect(releaseCamera()).toBe(0);
    });

    it('forgets a stream the device ended on its own', async () => {
        const stream = fakeStream();
        mockGetUserMedia([stream]);
        await openCamera({ video: true });

        // Camera unplugged, or claimed by the OS.
        (stream.tracks[0] as { readyState: string }).readyState = 'ended';
        (stream.tracks[0] as unknown as { fire: (e: string) => void }).fire('ended');

        expect(openCameraCount()).toBe(0);
    });

    it('treats a stream with no live track as unusable, so a fresh one is opened', () => {
        const stream = fakeStream();
        expect(isStreamLive(stream)).toBe(true);

        (stream.tracks[0] as { readyState: string }).readyState = 'ended';

        expect(isStreamLive(stream)).toBe(false);
        expect(isStreamLive(null)).toBe(false);
    });
});
