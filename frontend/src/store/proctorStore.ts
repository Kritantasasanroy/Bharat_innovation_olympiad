import { releaseCamera } from '@/lib/camera';
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
        fullscreen: false,
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

    /**
     * Clears proctoring state and turns the camera off.
     *
     * The camera part is not incidental. Setting `webcamStream: null` on its own
     * drops the only reference to a stream whose tracks are still live, which
     * leaves the camera on with nothing left able to stop it.
     */
    reset: () => {
        releaseCamera();
        set({
            deviceChecks: { viewport: false, webcam: false, fullscreen: false, audio: false },
            allChecksPassed: false,
            webcamStream: null,
            isWebcamActive: false,
            events: [],
            currentRiskScore: 0,
        });
    },
}));
