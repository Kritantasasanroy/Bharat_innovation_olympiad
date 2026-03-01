'use client';

import { disconnectSocket, getSocket } from '@/lib/socket';
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

export function useSocket(): Socket {
    const socketRef = useRef<Socket>(getSocket());
    return socketRef.current;
}

export function useSocketCleanup() {
    useEffect(() => {
        return () => {
            disconnectSocket();
        };
    }, []);
}
