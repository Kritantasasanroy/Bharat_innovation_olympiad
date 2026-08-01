/**
 * Turning a failure into something a student or parent can act on.
 *
 * The messages this replaces were technically true and practically useless —
 * "Network error", "Enrollment failed", "Failed to send OTP". A 14-year-old
 * halfway through registering learns nothing from those: not whether it was
 * their fault, not whether retrying will help, not what to do instead.
 *
 * Every message below follows the same shape:
 *
 *   1. what happened, in plain words;
 *   2. whose problem it is (almost always ours, and say so);
 *   3. exactly one thing to do next.
 *
 * The server's own message wins when it has one, because those are written for
 * the specific rule that was broken ("Both parental consent and consent to data
 * processing are required…") and are always more useful than a generic status
 * code. This only fills the gap when there is nothing better.
 */

interface ApiErrorShape {
    response?: { status?: number; data?: { message?: string | string[] } };
    code?: string;
    message?: string;
}

/** True when the browser knows it is offline. Worth saying plainly. */
function isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** The server's message, if it sent a usable one. */
function serverMessage(err: ApiErrorShape): string | null {
    const raw = err?.response?.data?.message;
    // class-validator returns an array of field errors; the first is the most
    // relevant and the rest are usually the same shape repeated.
    const text = Array.isArray(raw) ? raw[0] : raw;
    if (typeof text !== 'string' || !text.trim()) return null;
    // Nest's default messages for bare status codes are no better than ours.
    if (/^(Bad Request|Unauthorized|Forbidden|Not Found|Internal Server Error)$/i.test(text.trim())) {
        return null;
    }
    return text.trim();
}

/**
 * @param err      Whatever was thrown — an axios error, a fetch failure, anything.
 * @param action   What the user was trying to do, lower case and in their words:
 *                 "save your parent's details", "send your code". Used to build a
 *                 sentence, so it must read naturally after "We couldn't ".
 */
export function describeError(err: unknown, action: string): string {
    const e = (err ?? {}) as ApiErrorShape;

    if (isOffline()) {
        return `You appear to be offline, so we couldn't ${action}. Reconnect to the internet and try again — nothing you've entered has been lost.`;
    }

    const status = e?.response?.status;

    // No response at all: DNS, CORS, a dropped connection, or the server asleep.
    if (!status) {
        return `We couldn't reach our servers to ${action}. This is usually a brief connection problem — check your internet and try again in a moment.`;
    }

    const fromServer = serverMessage(e);

    switch (true) {
        case status === 400:
        case status === 422:
            // A validation failure the server can describe precisely.
            return fromServer ?? `Some of the details weren't accepted. Check what you've entered and try again.`;

        case status === 401:
            return `Your session has expired, so we couldn't ${action}. Please sign in again — your progress is saved.`;

        case status === 403:
            return fromServer ?? `You don't have permission to ${action}. If you think that's wrong, contact support and we'll sort it out.`;

        case status === 404:
            return fromServer ?? `We couldn't find what we needed to ${action}. Refresh the page and try again; if it keeps happening, contact support.`;

        case status === 409:
            return fromServer ?? `That's already been done, so we didn't ${action} again. Refresh the page to see the current state.`;

        case status === 413:
            return `That file is too large to upload. Pick a smaller one — or photograph the document again at a lower resolution — and try again.`;

        case status === 429:
            return `You've tried a few times in quick succession. Wait about a minute, then try again.`;

        case status >= 500:
            return `Something went wrong on our side while trying to ${action}. It isn't anything you did. Please try again in a moment — if it keeps happening, contact support.`;

        default:
            return fromServer ?? `We couldn't ${action} just now. Please try again.`;
    }
}

/**
 * Human-readable reason a camera could not be opened.
 *
 * `getUserMedia` failures are the single most common blocker in registration and
 * its error names are meaningless to a student — `NotAllowedError` tells them
 * nothing about the padlock icon in their address bar.
 */
export function describeCameraError(err: unknown): string {
    const name = (err as { name?: string })?.name ?? '';

    switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return "Your browser is blocking the camera. Click the padlock (or camera icon) in the address bar, set Camera to Allow, then reload this page.";
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return 'We couldn\'t find a camera on this device. Plug in a webcam, or switch to a laptop or tablet that has one built in.';
        case 'NotReadableError':
        case 'TrackStartError':
            return 'Your camera is already being used by another app. Close Zoom, Meet, Teams or any other tab using the camera, then try again.';
        case 'OverconstrainedError':
            return "Your camera doesn't support the quality we need. Try a different camera if you have one.";
        case 'SecurityError':
            return 'The camera can only be used on a secure connection. Make sure the address starts with https:// and try again.';
        default:
            return 'We couldn\'t start your camera. Check that no other app is using it, allow camera access when your browser asks, then try again.';
    }
}

/** File too big, said before an upload is attempted rather than after. */
export function describeOversizeFile(bytes: number, maxBytes: number): string {
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '');
    return `That file is ${mb(bytes)} MB, and the limit is ${mb(maxBytes)} MB. Take the photo again at a lower resolution, or use your phone's built-in option to reduce the image size, then upload it again.`;
}
