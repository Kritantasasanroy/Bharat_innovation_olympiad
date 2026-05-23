'use client';

import { useEffect, useRef, useState } from 'react';

interface FullscreenMonitorOptions {
  onViolation?: (type: 'exit_fullscreen' | 'tab_switch', count: number) => void;
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
  // isGated = true means the exam is blocked and fullscreen must be entered
  const [isGated, setIsGated] = useState(true);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const violationCountRef = useRef(0);
  // Ref mirror of isGated so event handlers always see current value without re-registering
  const isGatedRef = useRef(true);

  const checkFs = (): boolean =>
    !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

  const requestFullscreen = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      else if ((el as any).mozRequestFullScreen) await (el as any).mozRequestFullScreen();
      else if ((el as any).msRequestFullscreen) await (el as any).msRequestFullscreen();
    } catch (e) {
      console.warn('[Fullscreen] request failed:', e);
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      onAutoSubmit?.(`Exam paused for more than ${pauseTimeoutSec} seconds`);
    }, pauseTimeoutSec * 1000);
  };

  useEffect(() => {
    // On mount (including page refresh): check whether we are actually in fullscreen.
    // Browsers never restore fullscreen on reload so this will almost always be false.
    const inFs = checkFs();
    setIsFullscreen(inFs);
    setIsGated(!inFs);
    isGatedRef.current = !inFs;

    const onFsChange = () => {
      const inFs = checkFs();
      setIsFullscreen(inFs);

      if (inFs) {
        // User (re-)entered fullscreen — lift the gate
        setIsGated(false);
        isGatedRef.current = false;
        clearTimer();
      } else if (!isGatedRef.current) {
        // Left fullscreen while the exam was active (gate was not already showing)
        violationCountRef.current += 1;
        const count = violationCountRef.current;
        setViolationCount(count);
        onViolation?.('exit_fullscreen', count);

        if (count >= maxViolations) {
          onAutoSubmit?.(`Maximum violations reached (${maxViolations})`);
          return;
        }

        setIsGated(true);
        isGatedRef.current = true;
        startTimer();
      }
    };

    const onVisibility = () => {
      if (document.hidden && !isGatedRef.current) {
        // Tab switched while exam was active
        violationCountRef.current += 1;
        const count = violationCountRef.current;
        setViolationCount(count);
        onViolation?.('tab_switch', count);

        if (count >= maxViolations) {
          onAutoSubmit?.(`Maximum violations reached (${maxViolations})`);
          return;
        }

        setIsGated(true);
        isGatedRef.current = true;
        startTimer();
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange', onFsChange);
      document.removeEventListener('MSFullscreenChange', onFsChange);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimer();
    };
  }, []); // Empty deps — all mutable values go through refs

  return { isFullscreen, violationCount, isGated, requestFullscreen };
}
