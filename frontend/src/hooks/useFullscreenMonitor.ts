'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ViolationType = 'exit_fullscreen' | 'tab_switch' | 'window_blur';

interface FullscreenMonitorOptions {
  onViolation?: (type: ViolationType, count: number) => void;
  onAutoSubmit?: (reason: string) => void;
  maxViolations?: number;
  pauseTimeoutSec?: number;
}

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

// Module-level debounce: survives component re-mounts and React StrictMode
// double-effects. A single Escape / Windows-key press fires up to 6 browser
// events simultaneously (fullscreenchange, webkitfullscreenchange, blur,
// visibilitychange …). Only the first event within DEBOUNCE_MS registers a
// violation; every subsequent event is silently ignored until the window
// expires OR the student re-enters fullscreen (which resets the timestamp to 0).
let _lastViolationTimestamp = 0;
const DEBOUNCE_MS = 3000;

export function useFullscreenMonitor({
  onViolation,
  onAutoSubmit,
  maxViolations = 3,
  pauseTimeoutSec = 20,
}: FullscreenMonitorOptions) {
  const [violationCount, setViolationCount] = useState<number>(() => readStoredViolations());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGated, setIsGated] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const onViolationRef = useRef(onViolation);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  useEffect(() => { onViolationRef.current = onViolation; });
  useEffect(() => { onAutoSubmitRef.current = onAutoSubmit; });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const violationCountRef = useRef<number>(readStoredViolations());
  const isGatedRef = useRef(true);

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

    // Browser is already fullscreen (e.g. Windows-key blur). No fullscreenchange
    // will fire, so un-gate directly and reset the debounce window.
    if (checkFs()) {
      suppressBlurBriefly();
      setIsGated(false);
      isGatedRef.current = false;
      _lastViolationTimestamp = 0; // allow next distinct action to count
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
    if (isGatedRef.current) return; // already gated — skip

    // Module-level debounce: the first event in a DEBOUNCE_MS window wins;
    // every other event from the same physical keypress is discarded.
    const now = Date.now();
    if (now - _lastViolationTimestamp < DEBOUNCE_MS) return;
    _lastViolationTimestamp = now;

    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolationCount(count);
    writeStoredViolations(count);
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

    violationCountRef.current = readStoredViolations();

    const inFs = checkFs();
    setIsFullscreen(inFs);
    setIsGated(!inFs);
    isGatedRef.current = !inFs;

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
        _lastViolationTimestamp = 0; // reset debounce so next exit counts fresh
        setLastError(null);
        clearTimer();
        suppressBlurBriefly();
      } else {
        registerViolation('exit_fullscreen');
      }
    };

    const onVisibility = () => {
      if (document.hidden) registerViolation('tab_switch');
    };

    const onBlur = () => {
      if (ignoreBlurRef.current) return;
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
