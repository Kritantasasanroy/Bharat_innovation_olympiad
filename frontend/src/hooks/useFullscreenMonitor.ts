'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ViolationType = 'exit_fullscreen' | 'tab_switch' | 'window_blur';

interface FullscreenMonitorOptions {
  onViolation?: (type: ViolationType, count: number) => void;
  onAutoSubmit?: (reason: string) => void;
  maxViolations?: number;
  pauseTimeoutSec?: number;
}

// Derive a session-storage key from the current URL path so violation counts
// survive page refreshes but are scoped to this specific exam attempt.
function storageKey(): string {
  if (typeof window === 'undefined') return 'violations_unknown';
  return `violations_${window.location.pathname}`;
}

function readStoredViolations(): number {
  try {
    const raw = sessionStorage.getItem(storageKey());
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

function writeStoredViolations(count: number): void {
  try { sessionStorage.setItem(storageKey(), String(count)); } catch { /* ignore */ }
}

export function useFullscreenMonitor({
  onViolation,
  onAutoSubmit,
  maxViolations = 3,
  pauseTimeoutSec = 20,
}: FullscreenMonitorOptions) {
  // Restore violation count from sessionStorage so page refreshes don't reset it.
  const [violationCount, setViolationCount] = useState<number>(() => readStoredViolations());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGated, setIsGated] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  // Latest-ref pattern: keep callbacks fresh without re-registering listeners
  const onViolationRef = useRef(onViolation);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  useEffect(() => { onViolationRef.current = onViolation; });
  useEffect(() => { onAutoSubmitRef.current = onAutoSubmit; });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const violationCountRef = useRef<number>(readStoredViolations());
  const isGatedRef = useRef(true);

  // Blur events fire transiently when the browser transitions in/out of
  // fullscreen mode. Ignoring them for 2 s after a successful fullscreen entry
  // prevents the gate from immediately re-appearing after the user clicks
  // "Re-enter Fullscreen".
  const ignoreBlurRef = useRef(false);
  const ignoreBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suppressBlurBriefly = () => {
    ignoreBlurRef.current = true;
    if (ignoreBlurTimerRef.current) clearTimeout(ignoreBlurTimerRef.current);
    ignoreBlurTimerRef.current = setTimeout(() => {
      ignoreBlurRef.current = false;
    }, 2000);
  };

  const checkFs = (): boolean =>
    typeof document === 'undefined'
      ? false
      : !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );

  const requestFullscreen = useCallback(async () => {
    setLastError(null);
    if (typeof document === 'undefined') return;

    // Already in fullscreen (e.g. Windows key blur while browser stays fullscreen).
    // No fullscreenchange event will fire, so un-gate directly instead of
    // calling requestFullscreen() which would be a silent no-op.
    if (checkFs()) {
      suppressBlurBriefly();
      setIsGated(false);
      isGatedRef.current = false;
      clearTimer();
      return;
    }

    try {
      const el: any = document.documentElement;
      const reqFn =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
      if (!reqFn) {
        setLastError('Fullscreen API is not supported in this browser.');
        return;
      }
      // Suppress blur noise that fires during the fullscreen transition so the
      // gate doesn't immediately re-appear after the button is clicked.
      suppressBlurBriefly();
      await reqFn.call(el);
    } catch (e: any) {
      const msg =
        e?.message ||
        'Browser blocked the fullscreen request. Please click the button again.';
      setLastError(msg);
      console.warn('[Fullscreen] request failed:', e);
    }
  }, []);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      onAutoSubmitRef.current?.(`Exam paused for more than ${pauseTimeoutSec} seconds`);
    }, pauseTimeoutSec * 1000);
  };

  const registerViolation = (type: ViolationType) => {
    if (isGatedRef.current) return; // already gated — don't double-count

    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolationCount(count);
    writeStoredViolations(count); // persist across refreshes
    onViolationRef.current?.(type, count);

    if (count >= maxViolations) {
      onAutoSubmitRef.current?.(`Maximum violations reached (${maxViolations})`);
      return;
    }

    setIsGated(true);
    isGatedRef.current = true;
    startTimer();
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Restore violation ref from sessionStorage (state initialiser already set
    // the UI count; the ref needs to match so registerViolation counts correctly).
    violationCountRef.current = readStoredViolations();

    const inFs = checkFs();
    setIsFullscreen(inFs);
    setIsGated(!inFs);
    isGatedRef.current = !inFs;

    // Attempt auto-fullscreen on mount. Browsers require a user gesture, so
    // this typically succeeds only when the page was reached via a click (e.g.
    // the "Start Exam" button on the instructions page). Silently ignore errors.
    if (!inFs) {
      suppressBlurBriefly();
      const el: any = document.documentElement;
      const reqFn =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
      if (reqFn) {
        Promise.resolve(reqFn.call(el)).catch(() => { /* expected on page refresh */ });
      }
    }

    const onFsChange = () => {
      const inFsNow = checkFs();
      setIsFullscreen(inFsNow);
      if (inFsNow) {
        setIsGated(false);
        isGatedRef.current = false;
        setLastError(null);
        clearTimer();
        // Suppress blur that browsers fire when finishing the fullscreen
        // transition — without this the gate immediately re-appears.
        suppressBlurBriefly();
      } else {
        registerViolation('exit_fullscreen');
      }
    };

    const onVisibility = () => {
      if (document.hidden) registerViolation('tab_switch');
    };

    const onBlur = () => {
      if (ignoreBlurRef.current) return; // within the post-fullscreen suppression window
      registerViolation('window_blur');
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange', onFsChange);
      document.removeEventListener('MSFullscreenChange', onFsChange);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      clearTimer();
      if (ignoreBlurTimerRef.current) clearTimeout(ignoreBlurTimerRef.current);
    };
  }, []);

  return {
    isFullscreen,
    violationCount,
    isGated,
    lastError,
    maxViolations,
    requestFullscreen,
  };
}
