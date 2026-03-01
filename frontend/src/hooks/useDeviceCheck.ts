'use client';

import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH } from '@/lib/constants';
import { useProctorStore } from '@/store/proctorStore';
import { useEffect } from 'react';
import { useSebHeaders } from './useSebHeaders';

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

        // 3 & 4. Webcam + Audio check
        // enumerateDevices() may not detect devices before permission is granted.
        // We first try enumerating; if no devices found, request a temporary stream
        // to trigger the browser permission prompt, then re-enumerate.
        const checkMediaDevices = async () => {
            try {
                let devices = await navigator.mediaDevices.enumerateDevices();
                let hasCamera = devices.some((d) => d.kind === 'videoinput');
                let hasMic = devices.some((d) => d.kind === 'audioinput');

                // If no camera/mic found, it might be because permission hasn't been granted yet.
                // Request a temporary stream to trigger the permission prompt.
                if (!hasCamera && !hasMic) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                        // Stop the temporary stream immediately
                        stream.getTracks().forEach((t) => t.stop());
                        // Re-enumerate after permission is granted
                        devices = await navigator.mediaDevices.enumerateDevices();
                        hasCamera = devices.some((d) => d.kind === 'videoinput');
                        hasMic = devices.some((d) => d.kind === 'audioinput');
                    } catch {
                        // User denied or no devices — that's okay
                    }
                }

                setDeviceCheck('webcam', hasCamera);
                setDeviceCheck('audio', hasMic);
            } catch {
                setDeviceCheck('webcam', false);
                setDeviceCheck('audio', false);
            }
        };

        checkMediaDevices();

        return () => {
            window.removeEventListener('resize', checkViewport);
        };
    }, []);

    return { deviceChecks, allChecksPassed };
}
