'use client';

import { HEARTBEAT_INTERVAL_MS } from '@/lib/constants';
import { getSocket } from '@/lib/socket';
import { useExamStore } from '@/store/examStore';
import { useEffect, useRef } from 'react';

export function useTimer(attemptId: string) {
    const socket = getSocket();
    const { setRemaining, setExpired } = useExamStore();
    const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Join exam room for timer events
        socket.emit('join-exam', { attemptId });

        // Listen for server-authoritative timer ticks
        socket.on('timer-tick', (data: { remainingSecs: number; totalSecs: number }) => {
            setRemaining(data.remainingSecs);
        });

        // Listen for exam expiry
        socket.on('exam-expired', (data: { attemptId: string }) => {
            setExpired(true);
        });

        // Send heartbeats to detect disconnects
        heartbeatRef.current = setInterval(() => {
            socket.emit('heartbeat', { attemptId });
        }, HEARTBEAT_INTERVAL_MS);

        return () => {
            socket.off('timer-tick');
            socket.off('exam-expired');
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        };
    }, [attemptId]);

    const remaining = useExamStore((s) => s.remaining);
    const isExpired = useExamStore((s) => s.isExpired);

    return { remaining, isExpired };
}
