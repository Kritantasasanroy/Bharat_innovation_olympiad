'use client';

import { useProctorStore } from '@/store/proctorStore';
import { useCallback, useEffect, useRef } from 'react';

/**
 * useWebcam — manages the local webcam stream for student-facing display.
 *
 * Proctoring is now handled entirely by Meazure Learning (3rd-party).
 * This hook only handles:
 *   - Requesting camera permission and starting the stream
 *   - Attaching / re-attaching the stream to the <video> element
 *   - Stopping the stream on unmount
 *
 * Frame capture and backend analysis have been removed — Meazure's
 * Guardian browser extension handles all webcam/face/screen monitoring.
 */
export function useWebcam() {
    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const { webcamStream, setWebcamStream, setDeviceCheck } = useProctorStore();

    const attachStreamToElement = (el: HTMLVideoElement | null, stream: MediaStream | null) => {
        if (!el || !stream) return;
        if (el.srcObject !== stream) {
            el.srcObject = stream;
            el.play().catch(() => { /* autoplay may be blocked; ignore */ });
        }
    };

    // Callback ref — fires every time React mounts/unmounts the <video>.
    const videoRef = useCallback((el: HTMLVideoElement | null) => {
        videoElementRef.current = el;
        if (el) {
            const stream = useProctorStore.getState().webcamStream;
            attachStreamToElement(el, stream);
        }
    }, []);

    const startWebcam = useCallback(async () => {
        try {
            // Reuse an existing live stream (avoids re-prompting permission)
            const existing = useProctorStore.getState().webcamStream;
            if (existing && existing.getTracks().some((t) => t.readyState === 'live')) {
                attachStreamToElement(videoElementRef.current, existing);
                setDeviceCheck('webcam', true);
                return existing;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: false,
            });

            attachStreamToElement(videoElementRef.current, stream);
            setWebcamStream(stream);
            setDeviceCheck('webcam', true);
            return stream;
        } catch (err) {
            console.warn('[Webcam] Could not start camera:', err);
            setDeviceCheck('webcam', false);
            return null;
        }
    }, []);

    const stopWebcam = useCallback(() => {
        if (videoElementRef.current?.srcObject) {
            const stream = videoElementRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoElementRef.current.srcObject = null;
        }
        setWebcamStream(null);
    }, []);

    // Re-attach whenever the stream identity changes
    useEffect(() => {
        attachStreamToElement(videoElementRef.current, webcamStream);
    }, [webcamStream]);

    useEffect(() => {
        return () => { stopWebcam(); };
    }, []);

    return { videoRef, startWebcam, stopWebcam };
}
