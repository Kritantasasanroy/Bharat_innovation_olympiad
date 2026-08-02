'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * BROWSER LOCKDOWN FOR THE EXAM PLAYER
 * ────────────────────────────────────
 * The player is an ordinary web page, and an ordinary web page has a Back
 * button, a Reload button, F5, Ctrl+P and Print Screen. None of those are
 * acceptable during a proctored olympiad:
 *
 *  • **Back / Reload were a hole in proctoring.** Nothing on the server let a
 *    student re-sit a submitted paper — `startAttempt` throws "You have already
 *    completed this exam", and `expireIfOverdue` closes anything left past its
 *    deadline. But *while the attempt was live*, leaving the page unmounted
 *    every listener in `useFullscreenMonitor` and `useFaceProctor`, so a student
 *    could press Back, spend the rest of the paper's wall-clock duration
 *    completely unproctored, and walk back in. No violation was recorded because
 *    there was nothing left running to record one.
 *
 *  • **Reload cleared the room.** A refresh re-entered the player fresh, and the
 *    face-proctor's enrolment checks and the pause countdown all started over.
 *
 * The rules this hook enforces, in the order they take effect:
 *
 *  1. **Back is trapped, not merely discouraged.** A sentinel history entry is
 *     pushed on mount and re-pushed on every `popstate`, so Back never moves the
 *     student off the paper no matter how many times it is pressed. A blocked
 *     attempt raises a warning but costs no strike — nothing was gained by it.
 *
 *  2. **Reload is blocked at the keyboard and warned at the browser.** F5 and
 *     Ctrl/Cmd+R are swallowed; anything the page cannot swallow (the toolbar
 *     button, the menu) hits `beforeunload` and gets the browser's own
 *     "Leave site?" confirmation.
 *
 *  3. **If a reload or a back-navigation nonetheless succeeds, the paper is
 *     over.** A per-attempt marker in `sessionStorage` — which survives exactly
 *     the reloads and same-tab back-navigations we care about, and nothing
 *     else — means the next mount can tell "first entry" from "came back". A
 *     re-entry submits and locks, with the reason stated on screen. This is the
 *     "even if it works, it submits and locks" rule.
 *
 *  4. **One sanctioned way to reload**, {@link ExamLockdown.reload}, wired to an
 *     in-page button. It sets a one-shot pass so the re-entry check lets that
 *     single reload through.
 *
 * What this hook cannot do, and does not pretend to: a web page cannot stop the
 * operating system from taking a screenshot. Print Screen is detected (Windows
 * reports it on keyup only), the clipboard is cleared, the paper is masked and a
 * `SCREEN_CAPTURE` event is recorded — a deterrent and an audit trail, not a
 * prevention. Snipping Tool, a second device or a phone camera are invisible to
 * any browser-based proctor; those are what the face proctor and the human
 * review queue are for.
 */

export type LockdownBreach = 'reload' | 'back';
export type BlockedAction = 'reload' | 'back' | 'print' | 'capture' | 'devtools' | 'copy';

interface ExamLockdownOptions {
    /** Attempt this lockdown belongs to. Empty until the attempt is created. */
    attemptId: string;
    /** Off for the trial run and once the paper is over. */
    enabled: boolean;
    /** A reload or back-navigation actually succeeded — end and lock the paper. */
    onBreach: (breach: LockdownBreach) => void;
    /** Something was blocked before it took effect. Warn, do not punish. */
    onBlocked?: (action: BlockedAction) => void;
    /** A screenshot/print attempt was detected. Costs a violation. */
    onCaptureAttempt?: () => void;
}

const entryKey = (attemptId: string) => `exam_entry_${attemptId}`;
const reloadPassKey = (attemptId: string) => `exam_reload_pass_${attemptId}`;

/**
 * Window in which repeat capture signals collapse into one violation.
 *
 * Long enough to absorb the several events one keypress produces, short enough
 * that a student pressing Print Screen again a couple of seconds later is
 * counted again — which is the behaviour we want, since that is a second
 * deliberate attempt.
 */
const CAPTURE_COOLDOWN_MS = 1500;

/**
 * Which attempt this *JavaScript context* has already booted.
 *
 * A genuine reload tears down the whole context, so this is `null` again on the
 * way back in — which is precisely the signal we want. React's StrictMode
 * double-mount in development does not, so it sees its own attempt id here and
 * skips the breach. Without this, every dev-mode mount would instantly lock the
 * paper it just opened.
 */
let bootedAttemptId: string | null = null;

export function useExamLockdown({
    attemptId,
    enabled,
    onBreach,
    onBlocked,
    onCaptureAttempt,
}: ExamLockdownOptions) {
    const [isMasked, setIsMasked] = useState(false);

    const onBreachRef = useRef(onBreach);
    const onBlockedRef = useRef(onBlocked);
    const onCaptureRef = useRef(onCaptureAttempt);
    useEffect(() => { onBreachRef.current = onBreach; });
    useEffect(() => { onBlockedRef.current = onBlocked; });
    useEffect(() => { onCaptureRef.current = onCaptureAttempt; });

    const maskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Set once the paper is ending, so the exit guards stop fighting our own navigation. */
    const releasedRef = useRef(false);
    /** When the last capture attempt was counted — see {@link CAPTURE_COOLDOWN_MS}. */
    const lastCaptureRef = useRef(0);

    /**
     * Blanks the paper for a moment after a capture attempt.
     *
     * The screenshot already taken cannot be recalled, but every *subsequent*
     * one captures this instead of the questions, and the student is told
     * plainly that the attempt was seen and recorded.
     */
    const maskScreen = useCallback((ms = 2000) => {
        setIsMasked(true);
        if (maskTimerRef.current) clearTimeout(maskTimerRef.current);
        maskTimerRef.current = setTimeout(() => setIsMasked(false), ms);
    }, []);

    /**
     * One press, one violation.
     *
     * A single Print Screen can reach us more than once — Windows reports the
     * key on keyup, some setups on keydown too — and one Ctrl+P raises both the
     * keydown handler and `beforeprint`. Without this, one screenshot cost two
     * of the student's three strikes.
     */
    const handleCaptureAttempt = useCallback(() => {
        const now = Date.now();
        if (now - lastCaptureRef.current < CAPTURE_COOLDOWN_MS) return;
        lastCaptureRef.current = now;

        maskScreen();
        // Best-effort: strip whatever the capture may have put on the clipboard.
        // Requires document focus and permission, and fails silently otherwise.
        try {
            void navigator.clipboard?.writeText('').catch(() => { /* not permitted */ });
        } catch { /* no clipboard API */ }
        onCaptureRef.current?.();
    }, [maskScreen]);

    /** The only sanctioned reload: leaves a one-shot pass so re-entry is allowed. */
    const reload = useCallback(() => {
        if (!attemptId) return;
        try { sessionStorage.setItem(reloadPassKey(attemptId), '1'); } catch { /* ignore */ }
        releasedRef.current = true;
        window.location.reload();
    }, [attemptId]);

    /** Called by the player just before it navigates away on a real submit. */
    const release = useCallback(() => {
        releasedRef.current = true;
        if (!attemptId) return;
        try {
            sessionStorage.removeItem(entryKey(attemptId));
            sessionStorage.removeItem(reloadPassKey(attemptId));
        } catch { /* ignore */ }
    }, [attemptId]);

    // ── Re-entry detection ──────────────────────────────────────────────────
    // Runs once per attempt, before any of the guards below are installed:
    // whether this is a first sitting or a return decides everything else.
    useEffect(() => {
        if (!attemptId || !enabled) return;
        if (bootedAttemptId === attemptId) return; // StrictMode remount, not a reload
        bootedAttemptId = attemptId;

        let seenBefore = false;
        let hadPass = false;
        try {
            seenBefore = sessionStorage.getItem(entryKey(attemptId)) === '1';
            hadPass = sessionStorage.getItem(reloadPassKey(attemptId)) === '1';
            sessionStorage.removeItem(reloadPassKey(attemptId));
            sessionStorage.setItem(entryKey(attemptId), '1');
        } catch { /* private mode — fall through as a first entry */ }

        if (seenBefore && !hadPass) {
            // The student got back onto a paper they had already opened in this
            // tab: a browser reload, or Back into the player. Either way the
            // sitting is no longer continuous.
            onBreachRef.current('reload');
        }
    }, [attemptId, enabled]);

    // ── Back / forward trap ─────────────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;

        // A sentinel entry so the first Back press has somewhere harmless to go.
        try { history.pushState({ examGuard: true }, '', window.location.href); } catch { /* ignore */ }

        const onPopState = () => {
            if (releasedRef.current) return;
            // Immediately put the sentinel back, so holding Back down cannot
            // walk past it. The student never leaves the paper.
            try { history.pushState({ examGuard: true }, '', window.location.href); } catch { /* ignore */ }
            onBlockedRef.current?.('back');
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [enabled]);

    // ── Reload / close guard ────────────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;

        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (releasedRef.current) return;
            // The text is the browser's own — it stopped honouring custom
            // messages years ago. The value of this is the confirmation step
            // itself, which is what stops an accidental refresh.
            e.preventDefault();
            e.returnValue = '';
            return '';
        };

        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [enabled]);

    // ── Keyboard, capture and print blocking ────────────────────────────────
    useEffect(() => {
        if (!enabled) return;

        const isTextField = (t: EventTarget | null) => {
            const el = t as HTMLElement | null;
            const tag = el?.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable === true;
        };

        const block = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            const key = e.key;
            const mod = e.ctrlKey || e.metaKey;
            const upper = key.length === 1 ? key.toUpperCase() : key;

            // Reload: F5, Ctrl/Cmd+R, Ctrl+Shift+R.
            if (key === 'F5' || (mod && upper === 'R')) {
                block(e);
                onBlockedRef.current?.('reload');
                return;
            }

            // Back / forward by keyboard: Alt+Arrow, Backspace outside a field.
            if (e.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
                block(e);
                onBlockedRef.current?.('back');
                return;
            }
            if (key === 'Backspace' && !isTextField(e.target)) {
                block(e);
                return;
            }

            // Print — a print dialog is a screenshot with extra steps.
            if (mod && upper === 'P') {
                block(e);
                onBlockedRef.current?.('print');
                handleCaptureAttempt();
                return;
            }

            // Save page / view source.
            if (mod && (upper === 'S' || upper === 'U')) {
                block(e);
                return;
            }

            // DevTools — reading the DOM would expose the answer payload.
            if (key === 'F12' || (mod && e.shiftKey && ['I', 'J', 'C'].includes(upper))) {
                block(e);
                onBlockedRef.current?.('devtools');
                return;
            }

            // Copying the paper out.
            if (mod && ['C', 'X', 'A'].includes(upper) && !isTextField(e.target)) {
                block(e);
                onBlockedRef.current?.('copy');
                return;
            }

            // Windows fires Print Screen on keyup only, macOS uses Cmd+Shift+3/4/5.
            if (key === 'PrintScreen') {
                block(e);
                handleCaptureAttempt();
                return;
            }
            if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(key)) {
                handleCaptureAttempt();
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'PrintScreen') {
                handleCaptureAttempt();
            }
        };

        const onContextMenu = (e: MouseEvent) => e.preventDefault();
        const onCopy = (e: ClipboardEvent) => {
            if (isTextField(e.target)) return;
            e.preventDefault();
            onBlockedRef.current?.('copy');
        };
        // Fires for Ctrl+P *and* for the print entry in the browser menu, which
        // no keydown handler can see.
        const onBeforePrint = () => handleCaptureAttempt();

        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('copy', onCopy as EventListener);
        document.addEventListener('cut', onCopy as EventListener);
        window.addEventListener('beforeprint', onBeforePrint);

        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('contextmenu', onContextMenu);
            document.removeEventListener('copy', onCopy as EventListener);
            document.removeEventListener('cut', onCopy as EventListener);
            window.removeEventListener('beforeprint', onBeforePrint);
        };
    }, [enabled, handleCaptureAttempt]);

    useEffect(() => () => {
        if (maskTimerRef.current) clearTimeout(maskTimerRef.current);
    }, []);

    return { isMasked, reload, release };
}
