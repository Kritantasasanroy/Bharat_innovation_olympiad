'use client';

import api from '@/lib/api';
import {
    PROCTOR_FRAME_HEIGHT,
    PROCTOR_FRAME_INTERVAL_MS,
    PROCTOR_FRAME_QUALITY,
    PROCTOR_FRAME_WIDTH,
} from '@/lib/constants';
import { useProctorStore } from '@/store/proctorStore';
import { useCallback, useEffect, useRef } from 'react';

export function useWebcam(attemptId?: string) {
    // Underlying element ref — driven by a callback ref so the stream is
    // attached the moment React mounts the <video>, eliminating races where
    // getUserMedia resolves before the video element is in the DOM (or where
    // the element switches between two render branches).
    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const { webcamStream, setWebcamStream, setDeviceCheck } = useProctorStore();

    const attachStreamToElement = (el: HTMLVideoElement | null, stream: MediaStream | null) => {
        if (!el || !stream) return;
        if (el.srcObject !== stream) {
            el.srcObject = stream;
            el.play().catch(() => { /* autoplay may be blocked; ignore */ });
        }
    };

    // Callback ref — fires every time React mounts/unmounts the <video>.
    // Reads the current stream from the Zustand store so the closure stays fresh.
    const videoRef = useCallback((el: HTMLVideoElement | null) => {
        videoElementRef.current = el;
        if (el) {
            const stream = useProctorStore.getState().webcamStream;
            attachStreamToElement(el, stream);
        }
    }, []);

    const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
        canvasElementRef.current = el;
    }, []);

    const startWebcam = useCallback(async () => {
        try {
            // Reuse an existing live stream (e.g. after re-mount) instead of
            // re-prompting the user for camera permission.
            const existing = useProctorStore.getState().webcamStream;
            if (existing && existing.getTracks().some((t) => t.readyState === 'live')) {
                attachStreamToElement(videoElementRef.current, existing);
                setDeviceCheck('webcam', true);
                return existing;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: PROCTOR_FRAME_WIDTH, height: PROCTOR_FRAME_HEIGHT, facingMode: 'user' },
                audio: false,
            });

            attachStreamToElement(videoElementRef.current, stream);
            setWebcamStream(stream);
            setDeviceCheck('webcam', true);
            return stream;
        } catch (err) {
            console.warn('Webcam error:', err);
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
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setWebcamStream(null);
    }, []);

    const startProctoring = useCallback(() => {
        if (!attemptId) return;
        if (intervalRef.current) return;

        intervalRef.current = setInterval(async () => {
            const video = videoElementRef.current;
            const canvas = canvasElementRef.current;
            if (!video || !canvas) return;
            if (video.readyState < 2) return;

            canvas.width = PROCTOR_FRAME_WIDTH;
            canvas.height = PROCTOR_FRAME_HEIGHT;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(video, 0, 0, PROCTOR_FRAME_WIDTH, PROCTOR_FRAME_HEIGHT);

            canvas.toBlob(
                async (blob) => {
                    if (!blob) return;
                    const formData = new FormData();
                    formData.append('frame', blob, 'frame.jpg');
                    formData.append('attemptId', attemptId);

                    try {
                        const { data } = await api.post('/proctor/analyze-frame', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        if (data.flags && data.flags.length > 0) {
                            console.warn('[Proctor] Flags:', data.flags);
                        }
                    } catch (err) {
                        console.error('[Proctor] Frame analysis error:', err);
                    }
                },
                'image/jpeg',
                PROCTOR_FRAME_QUALITY
            );
        }, PROCTOR_FRAME_INTERVAL_MS);
    }, [attemptId]);

    // Re-attach whenever the stream identity changes (covers the case where
    // the stream is created while the video element isn't yet mounted).
    useEffect(() => {
        attachStreamToElement(videoElementRef.current, webcamStream);
    }, [webcamStream]);

    useEffect(() => {
        return () => { stopWebcam(); };
    }, []);

    return {
        videoRef,
        canvasRef,
        startWebcam,
        stopWebcam,
        startProctoring,
    };
}
