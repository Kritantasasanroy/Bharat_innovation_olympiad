'use client';

import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH } from '@/lib/constants';
import { useProctorStore } from '@/store/proctorStore';
import { useEffect } from 'react';
import { useSebHeaders } from './useSebHeaders';

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
    const { isSebBrowser } = useSebHeaders();

    useEffect(() => {
        // 1. Viewport check — minimum 1024×768 ("10-inch class")
        const checkViewport = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const sw = window.screen.width;
            const sh = window.screen.height;

            const viewportOk =
                w >= MIN_VIEWPORT_WIDTH &&
                h >= MIN_VIEWPORT_HEIGHT &&
                sw >= MIN_VIEWPORT_WIDTH &&
                sh >= MIN_VIEWPORT_HEIGHT;

            setDeviceCheck('viewport', viewportOk);
        };

        checkViewport();
        window.addEventListener('resize', checkViewport);

        // 2. SEB check
        setDeviceCheck('seb', isSebBrowser());

        // 3 & 4. Webcam + Audio — always request permission first
        const checkCamera = async () => {
            try {
                // Request camera permission — this triggers the browser prompt
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' },
                });
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
            console.error('[DeviceCheck] navigator.mediaDevices not available — page must be served over HTTPS');
            setDeviceCheck('webcam', false);
            setDeviceCheck('audio', false);
        }

        return () => {
            window.removeEventListener('resize', checkViewport);
        };
    }, []);

    return { deviceChecks, allChecksPassed };
}
