import { DeviceCheckStatus, ProctorEvent } from '@/types/proctor';
import { create } from 'zustand';

interface ProctorState {
    // Device checks
    deviceChecks: DeviceCheckStatus;
    allChecksPassed: boolean;

    // Webcam
    webcamStream: MediaStream | null;
    isWebcamActive: boolean;

    // Events
    events: ProctorEvent[];
    currentRiskScore: number;

    // Actions
    setDeviceCheck: (key: keyof DeviceCheckStatus, value: boolean) => void;
    setWebcamStream: (stream: MediaStream | null) => void;
    addEvent: (event: ProctorEvent) => void;
    setRiskScore: (score: number) => void;
    reset: () => void;
}

export const useProctorStore = create<ProctorState>((set, get) => ({
    deviceChecks: {
        viewport: false,
        webcam: false,
        seb: false,
        audio: false,
    },
    allChecksPassed: false,
    webcamStream: null,
    isWebcamActive: false,
    events: [],
    currentRiskScore: 0,

    setDeviceCheck: (key, value) =>
        set((state) => {
            const checks = { ...state.deviceChecks, [key]: value };
            const allChecksPassed = Object.values(checks).every(Boolean);
            return { deviceChecks: checks, allChecksPassed };
        }),

    setWebcamStream: (stream) =>
        set({ webcamStream: stream, isWebcamActive: !!stream }),

    addEvent: (event) =>
        set((state) => ({ events: [...state.events, event] })),

    setRiskScore: (score) => set({ currentRiskScore: score }),

    reset: () =>
        set({
            deviceChecks: { viewport: false, webcam: false, seb: false, audio: false },
            allChecksPassed: false,
            webcamStream: null,
            isWebcamActive: false,
            events: [],
            currentRiskScore: 0,
        }),
}));
