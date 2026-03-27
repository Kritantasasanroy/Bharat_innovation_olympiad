'use client';

import { useEffect, useRef, useState } from 'react';

interface FullscreenMonitorOptions {
  onViolation: (type: 'exit_fullscreen' | 'tab_switch', count: number) => void;
  onPause: () => void;
  onResume: () => void;
  onAutoSubmit: (reason: string) => void;
  maxViolations?: number;
  pauseTimeoutSec?: number;
}

export function useFullscreenMonitor({
  onViolation,
  onPause,
  onResume,
  onAutoSubmit,
  maxViolations = 3,
  pauseTimeoutSec = 20,
}: FullscreenMonitorOptions) {
  const [isPaused, setIsPaused] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const violationCountRef = useRef(0);

  // Request fullscreen on mount
  const requestFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).mozRequestFullScreen) {
        await (elem as any).mozRequestFullScreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
    } catch (err) {
      console.error('[Fullscreen] Request failed:', err);
    }
  };

  // Check if currently in fullscreen
  const checkFullscreen = () => {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
  };

  // Handle violation
  const handleViolation = (type: 'exit_fullscreen' | 'tab_switch') => {
    violationCountRef.current += 1;
    setViolationCount(violationCountRef.current);
    onViolation(type, violationCountRef.current);

    // Check if max violations reached
    if (violationCountRef.current >= maxViolations) {
      onAutoSubmit(`Maximum violations reached (${maxViolations})`);
      return;
    }

    // Pause the exam
    setIsPaused(true);
    onPause();

    // Clear existing pause timer
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
    }

    // Set timeout for auto-submit
    pauseTimerRef.current = setTimeout(() => {
      onAutoSubmit(`Exam paused for more than ${pauseTimeoutSec} seconds`);
    }, pauseTimeoutSec * 1000);
  };

  // Handle resume
  const handleResume = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    setIsPaused(false);
    onResume();
  };

  useEffect(() => {
    // Request fullscreen on mount if we're not already in fullscreen
    // Wrap in a user interaction event listener or just attempt and catch the warning silently
    // since browsers require user gesture to enter fullscreen.
    const attemptFullscreen = async () => {
      try {
        if (!checkFullscreen()) {
          await requestFullscreen();
        }
      } catch (e) {
        console.warn('Fullscreen request blocked by browser policy. User needs to interact with page first.');
      }
    };
    
    attemptFullscreen();

    // Fullscreen change handler
    const handleFullscreenChange = () => {
      const inFullscreen = checkFullscreen();
      setIsFullscreen(inFullscreen);

      if (!inFullscreen) {
        // User exited fullscreen
        handleViolation('exit_fullscreen');
      } else if (isPaused) {
        // User returned to fullscreen
        handleResume();
      }
    };

    // Visibility change handler (tab switching)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched tabs or minimized
        handleViolation('tab_switch');
      } else if (isPaused && checkFullscreen()) {
        // User returned and is in fullscreen
        handleResume();
      }
    };

    // Blur handler (window lost focus)
    const handleBlur = () => {
      if (!document.hidden && checkFullscreen()) {
        // Window lost focus but tab is still visible and in fullscreen
        // This could be Alt+Tab or clicking outside
        handleViolation('tab_switch');
      }
    };

    // Focus handler
    const handleFocus = () => {
      if (isPaused && !document.hidden && checkFullscreen()) {
        handleResume();
      }
    };

    // Add event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    // Cleanup
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);

      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }
    };
  }, [isPaused]);

  return {
    isPaused,
    violationCount,
    isFullscreen,
    requestFullscreen,
  };
}
