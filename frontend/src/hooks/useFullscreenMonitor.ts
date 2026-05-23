'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ViolationType = 'exit_fullscreen' | 'tab_switch' | 'window_blur';

interface FullscreenMonitorOptions {
  onViolation?: (type: ViolationType, count: number) => void;
  onAutoSubmit?: (reason: string) => void;
  maxViolations?: number;
  pauseTimeoutSec?: number;
}

export function useFullscreenMonitor({
  onViolation,
  onAutoSubmit,
  maxViolations = 3,
  pauseTimeoutSec = 20,
}: FullscreenMonitorOptions) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  // isGated = true means the exam is blocked behind the fullscreen overlay
  const [isGated, setIsGated] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  // Latest-ref pattern: keep callbacks fresh without re-registering listeners
  const onViolationRef = useRef(onViolation);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  useEffect(() => { onViolationRef.current = onViolation; });
  useEffect(() => { onAutoSubmitRef.current = onAutoSubmit; });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const violationCountRef = useRef(0);
  const isGatedRef = useRef(true);

  const checkFs = (): boolean =>
    typeof document === 'undefined'
      ? false
      : !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );

  // Must be invoked from a real user gesture (button onClick) — async/await
  // works because the underlying call is dispatched synchronously.
  const requestFullscreen = useCallback(async () => {
    setLastError(null);
    if (typeof document === 'undefined') return;
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
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      onAutoSubmitRef.current?.(
        `Exam paused for more than ${pauseTimeoutSec} seconds`,
      );
    }, pauseTimeoutSec * 1000);
  };

  const registerViolation = (type: ViolationType) => {
    // If the gate is already up the user is already paying for a prior
    // violation — don't double-count back-to-back signals (e.g. exit_fs +
    // blur firing together).
    if (isGatedRef.current) return;

    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolationCount(count);
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

    // On mount (and after page refresh) browsers never restore fullscreen,
    // so the gate will almost always be shown immediately.
    const inFs = checkFs();
    setIsFullscreen(inFs);
    setIsGated(!inFs);
    isGatedRef.current = !inFs;

    const onFsChange = () => {
      const inFsNow = checkFs();
      setIsFullscreen(inFsNow);

      if (inFsNow) {
        // Successfully entered fullscreen — lift the gate
        setIsGated(false);
        isGatedRef.current = false;
        setLastError(null);
        clearTimer();
      } else {
        // Exited fullscreen during an active exam
        registerViolation('exit_fullscreen');
      }
    };

    const onVisibility = () => {
      if (document.hidden) registerViolation('tab_switch');
    };

    const onBlur = () => {
      // Catches Alt-Tab / Cmd-Tab / clicking another app even when the
      // page stays "visible" per the Visibility API.
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
    };
  }, []); // Empty deps: listeners register once, refs keep state current

  return {
    isFullscreen,
    violationCount,
    isGated,
    lastError,
    maxViolations,
    requestFullscreen,
  };
}
