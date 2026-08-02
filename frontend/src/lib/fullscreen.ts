/**
 * Entering fullscreen, from the one place a browser will allow it.
 *
 * ## Why this is not just `element.requestFullscreen()`
 *
 * The Fullscreen API requires **transient user activation**: the call has to
 * happen inside the handler for a real click or keypress, and the activation is
 * consumed almost immediately after. A `requestFullscreen()` fired from a
 * `useEffect` on mount — which is what the exam player did — has no activation
 * behind it, so Chrome rejects it with "API can only be initiated by a user
 * gesture" and the player falls back to its "Enter Fullscreen & Start" gate.
 *
 * That gate is a safety net for a mid-exam exit, not the way in. The way in is
 * to call this from the Start Exam click on the instructions page and *then*
 * navigate: Next.js routes on the client, so the document never unloads and the
 * fullscreen state carries straight into the player, which mounts already
 * fullscreen and never shows the gate at all.
 *
 * ## Why failure is not fatal
 *
 * Fullscreen can still be refused — an enterprise policy, an unusual browser, a
 * user who dismissed the permission. The caller starts the exam regardless: the
 * player's own gate then does its original job of asking for fullscreen
 * explicitly. Blocking entry on this would turn a cosmetic failure into a
 * student who cannot sit their paper.
 */

type FullscreenCapableElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};

/** Whether the document is fullscreen right now, across the vendor prefixes. */
export function isFullscreenActive(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as FullscreenCapableDocument;
    return Boolean(
        doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement,
    );
}

/** Whether this browser exposes the Fullscreen API at all. */
export function isFullscreenSupported(): boolean {
    if (typeof document === 'undefined') return false;
    const el = document.documentElement as FullscreenCapableElement;
    return Boolean(
        el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.mozRequestFullScreen ||
            el.msRequestFullscreen,
    );
}

/**
 * Takes the whole document fullscreen. Must be called synchronously from a user
 * gesture handler. Resolves `true` if the browser is fullscreen afterwards.
 */
export async function enterFullscreen(): Promise<boolean> {
    if (typeof document === 'undefined') return false;
    if (isFullscreenActive()) return true;

    const el = document.documentElement as FullscreenCapableElement;
    const request =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
    if (!request) return false;

    try {
        await request.call(el);
    } catch (err) {
        console.warn('[Fullscreen] request rejected:', err);
        return isFullscreenActive();
    }

    // Safari resolves the promise a beat before `fullscreenElement` is set, so a
    // bare `return true` here would be a guess. Re-read the real state instead.
    return isFullscreenActive();
}
