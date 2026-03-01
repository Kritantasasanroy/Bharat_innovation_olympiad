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

        // 3. Webcam check — just test availability, actual stream is started later
        navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
                const hasCamera = devices.some((d) => d.kind === 'videoinput');
                setDeviceCheck('webcam', hasCamera);
            })
            .catch(() => {
                setDeviceCheck('webcam', false);
            });

        // 4. Audio check
        navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
                const hasMic = devices.some((d) => d.kind === 'audioinput');
                setDeviceCheck('audio', hasMic);
            })
            .catch(() => {
                setDeviceCheck('audio', false);
            });

        return () => {
            window.removeEventListener('resize', checkViewport);
        };
    }, []);

    return { deviceChecks, allChecksPassed };
}
