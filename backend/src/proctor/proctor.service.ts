import { Injectable, Logger } from '@nestjs/common';
import { ProctorEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

export interface ProctorSession {
    sessionId: string;
    launchUrl: string;
    status: string;
}

/**
 * ProctorService — Meazure Learning / ProctorU Integration
 *
 * Delegates all AI proctoring (webcam, face, screen monitoring) to the
 * Meazure Learning platform via the proctor-service Python bridge.
 *
 * Responsibility boundary:
 *   - This service: session lifecycle, event storage, risk scoring
 *   - proctor-service (Python): Meazure API calls, webhook validation
 *   - Meazure: actual webcam/face/screen monitoring on student device
 *
 * Layer 1 & 2 anti-cheat (fullscreen + tab monitoring) remain in the
 * frontend (useFullscreenMonitor) and are stored via createEvent().
 */
@Injectable()
export class ProctorService {
    private readonly logger = new Logger('ProctorService');
    private readonly proctorServiceUrl: string;
    private readonly proctorApiKey: string;

    constructor(private prisma: PrismaService) {
        this.proctorServiceUrl = process.env.PROCTOR_SERVICE_URL || 'http://localhost:5000';
        this.proctorApiKey = process.env.PROCTOR_API_KEY || 'dev-proctor-key';
    }

    // ── Session Management ──

    /**
     * Create a Meazure proctoring session for a student exam attempt.
     * Called immediately after startAttempt() creates the Attempt row.
     * Returns a launch_url the student opens in the Meazure Guardian browser.
     */
    async createSession(
        attemptId: string,
        userId: string,
        examTitle: string,
        durationMinutes: number,
    ): Promise<ProctorSession> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true, email: true },
        });

        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        try {
            const { data } = await axios.post(
                `${this.proctorServiceUrl}/sessions/create`,
                {
                    attempt_id: attemptId,
                    user_id: userId,
                    exam_title: examTitle,
                    duration_minutes: durationMinutes,
                    student_name: `${user.firstName} ${user.lastName}`.trim(),
                    student_email: user.email,
                },
                {
                    headers: { 'x-api-key': this.proctorApiKey },
                    timeout: 15_000,
                },
            );

            this.logger.log(
                `[Session] attempt=${attemptId} session=${data.session_id} status=${data.status}`,
            );

            return {
                sessionId: data.session_id,
                launchUrl: data.launch_url,
                status: data.status,
            };
        } catch (err: any) {
            this.logger.error(
                `[Session] Failed to create Meazure session for attempt=${attemptId}: ${err.message}`,
            );
            // Non-fatal — exam can still proceed; student won't have proctored session
            return {
                sessionId: '',
                launchUrl: '',
                status: 'ERROR',
            };
        }
    }

    /**
     * Get current status of a Meazure proctoring session.
     */
    async getSessionStatus(sessionId: string): Promise<ProctorSession> {
        const { data } = await axios.get(
            `${this.proctorServiceUrl}/sessions/${sessionId}`,
            { headers: { 'x-api-key': this.proctorApiKey }, timeout: 10_000 },
        );
        return { sessionId: data.session_id, launchUrl: data.launch_url, status: data.status };
    }

    // ── Event Handling ──

    /**
     * Store a proctoring event.
     * Called by:
     *   - Frontend (fullscreen/tab violations via POST /proctor/events)
     *   - NestJS webhook receiver (Meazure events forwarded by proctor-service)
     */
    async createEvent(
        attemptId: string,
        type: ProctorEventType,
        details?: Record<string, any>,
        severity?: number,
    ) {
        const event = await this.prisma.proctorEvent.create({
            data: {
                attemptId,
                type,
                severity: severity ?? this.getSeverity(type),
                details: details ?? {},
            },
        });

        await this.updateRiskScore(attemptId);
        return event;
    }

    /**
     * Recalculate and persist the risk score on the Attempt row.
     * Called after every new ProctorEvent.
     */
    async updateRiskScore(attemptId: string): Promise<number> {
        const events = await this.prisma.proctorEvent.findMany({
            where: { attemptId },
        });

        let risk = 0;
        for (const event of events) {
            risk += event.severity * 0.05;
        }
        risk = Math.min(risk, 1.0);

        await this.prisma.attempt.update({
            where: { id: attemptId },
            data: { riskScore: risk },
        });

        return risk;
    }

    /**
     * Build the full proctoring report for an attempt (admin view).
     */
    async getReport(attemptId: string) {
        const [events, attempt] = await Promise.all([
            this.prisma.proctorEvent.findMany({
                where: { attemptId },
                orderBy: { timestamp: 'asc' },
            }),
            this.prisma.attempt.findUnique({
                where: { id: attemptId },
                select: { riskScore: true },
            }),
        ]);

        return {
            attemptId,
            totalEvents: events.length,
            riskScore: attempt?.riskScore ?? 0,
            events,
            summary: this.summarizeEvents(events),
        };
    }

    // ── Severity Map ──

    private getSeverity(type: ProctorEventType): number {
        const map: Partial<Record<ProctorEventType, number>> = {
            NO_FACE: 3,
            MULTIPLE_FACES: 4,
            FACE_MISMATCH: 5,
            TAB_SWITCH: 4,
            EXIT_FULLSCREEN: 4,
            SCREEN_CAPTURE: 5,
            NETWORK_DISCONNECT: 2,
            IP_CHANGE: 2,
            SEB_VIOLATION: 5,
        };
        return map[type] ?? 1;
    }

    private summarizeEvents(events: { type: string }[]) {
        const counts: Record<string, number> = {};
        for (const e of events) {
            counts[e.type] = (counts[e.type] ?? 0) + 1;
        }
        return counts;
    }
}
