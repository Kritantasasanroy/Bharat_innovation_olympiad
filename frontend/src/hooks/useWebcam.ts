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
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const { setWebcamStream, setDeviceCheck } = useProctorStore();

    const startWebcam = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: PROCTOR_FRAME_WIDTH, height: PROCTOR_FRAME_HEIGHT, facingMode: 'user' },
                audio: false,
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            setWebcamStream(stream);
            setDeviceCheck('webcam', true);

            return stream;
        } catch (err) {
            console.error('Webcam error:', err);
            setDeviceCheck('webcam', false);
            return null;
        }
    }, []);

    const stopWebcam = useCallback(() => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        setWebcamStream(null);
    }, []);

    // Periodic frame capture for proctoring
    const startProctoring = useCallback(() => {
        if (!attemptId) return;

        intervalRef.current = setInterval(async () => {
            if (!canvasRef.current || !videoRef.current) return;

            const canvas = canvasRef.current;
            canvas.width = PROCTOR_FRAME_WIDTH;
            canvas.height = PROCTOR_FRAME_HEIGHT;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(videoRef.current, 0, 0, PROCTOR_FRAME_WIDTH, PROCTOR_FRAME_HEIGHT);

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
                        // Handle proctor flags
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

    useEffect(() => {
        return () => {
            stopWebcam();
        };
    }, []);

    return {
        videoRef,
        canvasRef,
        startWebcam,
        stopWebcam,
        startProctoring,
    };
}
