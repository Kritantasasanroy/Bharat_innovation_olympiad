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

/**
 * VIOLATION DEDUPLICATION LOGIC
 * ─────────────────────────────
 * A single physical key press (Escape / Windows key / Alt+Tab) causes the
 * browser to fire several events in the same tick:
 *   • fullscreenchange  (+ webkit/moz/ms variants = up to 4 events)
 *   • visibilitychange
 *   • window blur
 *
 * To ensure exactly ONE violation is counted per distinct user action:
 *
 * 1. `_violationLocked` is a synchronous boolean that is set to `true` the
 *    instant the FIRST event wins. Every subsequent event in the same tick
 *    (or within LOCK_MS) sees `true` and returns immediately.
 *
 * 2. After LOCK_MS the lock is released, so the NEXT distinct action by the
 *    student (e.g. they re-enter fullscreen and exit again) can be counted.
 *
 * 3. When the student successfully re-enters fullscreen, the lock is cleared
 *    immediately so the next exit starts a fresh count.
 *
 * LOCK_MS is deliberately generous (5 s) because all browser-generated
 * duplicate events for a single keypress arrive within the same JS microtask
 * queue flush (< 1 ms). 5 s gives plenty of margin without hiding real
 * subsequent violations (student would need to exit → re-enter → exit again
 * within 5 s for the second violation to be missed, which is unlikely).
 */
let _violationLocked = false;
let _lockTimer: ReturnType<typeof setTimeout> | null = null;
const LOCK_MS = 5000; // generous cooldown to absorb all duplicate browser events

function acquireViolationLock(): boolean {
  // Returns true if this caller is the FIRST (wins the lock), false if blocked.
  if (_violationLocked) return false;
  _violationLocked = true;
  if (_lockTimer) clearTimeout(_lockTimer);
  _lockTimer = setTimeout(() => {
    _violationLocked = false;
    _lockTimer = null;
  }, LOCK_MS);
  return true;
}

function releaseViolationLock(): void {
  _violationLocked = false;
  if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null; }
}

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

  // Suppress blur briefly after requesting fullscreen to avoid spurious events
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

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      onAutoSubmitRef.current?.(`Exam paused for more than ${pauseTimeoutSec} seconds`);
    }, pauseTimeoutSec * 1000);
  };

  /**
   * Register exactly ONE violation for the current distinct user action.
   * Uses `acquireViolationLock()` to ensure concurrent events from the same
   * physical keypress are all ignored after the first one wins.
   */
  const registerViolation = (type: ViolationType) => {
    if (isGatedRef.current) return; // already gated — skip

    // CRITICAL: try to acquire the lock synchronously.
    // Only the FIRST event from a cluster of simultaneous browser events wins.
    if (!acquireViolationLock()) return;

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

  const requestFullscreen = useCallback(async () => {
    setLastError(null);
    if (typeof document === 'undefined') return;

    // Already fullscreen (e.g. Windows-key blur). No fullscreenchange will fire,
    // so un-gate directly and release the violation lock so the next distinct
    // exit can be counted fresh.
    if (checkFs()) {
      suppressBlurBriefly();
      setIsGated(false);
      isGatedRef.current = false;
      releaseViolationLock(); // student is back — allow next exit to count
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
        // Student returned to fullscreen — un-gate and release lock so the
        // next exit starts a fresh violation count.
        setIsGated(false);
        isGatedRef.current = false;
        releaseViolationLock();
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
