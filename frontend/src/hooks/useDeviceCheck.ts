'use client';

import { openCamera } from '@/lib/camera';
import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH } from '@/lib/constants';
import { isFullscreenSupported } from '@/lib/fullscreen';
import { useProctorStore } from '@/store/proctorStore';
import { useEffect } from 'react';

/**
 * Checks device compatibility for the exam environment.
 *
 * Strategy for webcam/audio:
 *   1. Always request getUserMedia FIRST to trigger the browser permission prompt.
 *      enumerateDevices() alone is unreliable — most browsers return devices
 *      with empty labels (or no devices at all) before permission is granted.
 *   2. Request video and audio SEPARATELY so one failing doesn't block the other.
 *   3. Stop temporary streams immediately after confirming they work.
 *   4. Re-enumerate devices after permission is granted for accurate results.
 */
export function useDeviceCheck() {
    const { setDeviceCheck, deviceChecks, allChecksPassed } = useProctorStore();

    useEffect(() => {
        /**
         * 1. Screen check — is this device capable of running the player at all?
         *
         * Measured against `window.screen`, not `window.inner*`. The exam is
         * entered fullscreen, so the window becomes the screen a moment after
         * this passes; judging a student on the size their browser window
         * happened to be was failing them for something the Start button fixes.
         *
         * Orientation is normalised because a tablet held in portrait reports a
         * width below the floor while being perfectly able to sit the exam once
         * it is turned — and fullscreen does not rotate it, the student does.
         */
        const checkViewport = () => {
            const long = Math.max(window.screen.width, window.screen.height);
            const short = Math.min(window.screen.width, window.screen.height);

            setDeviceCheck(
                'viewport',
                long >= MIN_VIEWPORT_WIDTH && short >= MIN_VIEWPORT_HEIGHT,
            );
        };

        checkViewport();
        // `resize` still matters: a rotated tablet or a screen change fires it,
        // and `orientationchange` is not reliable across browsers.
        window.addEventListener('resize', checkViewport);
        window.addEventListener('orientationchange', checkViewport);

        // 2. Fullscreen capability check
        setDeviceCheck('fullscreen', isFullscreenSupported());

        // 3 & 4. Webcam + Audio — always request permission first
        const checkCamera = async () => {
            try {
                // Request camera permission — this triggers the browser prompt.
                // Opened through the registry so that even if this probe is
                // interrupted mid-flight, the stream is still something
                // `releaseCamera()` can reach. See `lib/camera.ts`.
                const stream = await openCamera({ video: { facingMode: 'user' } });
                // Camera works — stop the temporary stream
                stream.getTracks().forEach((t) => t.stop());
                setDeviceCheck('webcam', true);
            } catch (err: unknown) {
                console.warn('[DeviceCheck] Camera check failed:', err);
                setDeviceCheck('webcam', false);
            }
        };

        const checkMicrophone = async () => {
            try {
                // Request microphone permission separately
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                stream.getTracks().forEach((t) => t.stop());
                setDeviceCheck('audio', true);
            } catch (err: unknown) {
                console.warn('[DeviceCheck] Microphone check failed:', err);
                setDeviceCheck('audio', false);
            }
        };

        // Check if mediaDevices API is available at all
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            // Run camera and mic checks in parallel (separate prompts)
            checkCamera();
            checkMicrophone();
        } else {
            console.warn('[DeviceCheck] navigator.mediaDevices not available — page must be served over HTTPS');
            setDeviceCheck('webcam', false);
            setDeviceCheck('audio', false);
        }

        return () => {
            window.removeEventListener('resize', checkViewport);
            window.removeEventListener('orientationchange', checkViewport);
        };
    }, []);

    return { deviceChecks, allChecksPassed };
}
