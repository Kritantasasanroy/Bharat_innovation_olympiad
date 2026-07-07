export type ProctorEventType =
    | 'NO_FACE'
    | 'MULTIPLE_FACES'
    | 'FACE_MISMATCH'
    | 'LOOKING_AWAY'
    | 'TAB_SWITCH'
    | 'EXIT_FULLSCREEN'
    | 'SCREEN_CAPTURE'
    | 'NETWORK_DISCONNECT'
    | 'SEB_VIOLATION'
    | 'IP_CHANGE';

export interface ProctorEvent {
    id: string;
    attemptId: string;
    type: ProctorEventType;
    severity: number;
    details?: Record<string, unknown>;
    timestamp: string;
}

export interface FrameAnalysisResult {
    facePresent: boolean;
    numFaces: number;
    matchScore: number | null;
    riskScore: number;
    flags: string[];
}

export interface DeviceCheckStatus {
    viewport: boolean;
    webcam: boolean;
    fullscreen: boolean;
    audio: boolean;
}

export interface LiveMonitoringEntry {
    attemptId: string;
    userId: string;
    studentName: string;
    studentEmail: string;
    examTitle: string;
    startedAt: string;
    riskScore: number;
    recentEvents: ProctorEvent[];
    eventCounts: Record<string, number>;
}
