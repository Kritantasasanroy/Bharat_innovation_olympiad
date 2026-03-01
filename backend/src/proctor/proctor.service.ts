import { Injectable } from '@nestjs/common';
import { ProctorEventType } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProctorService {
    private proctorApiUrl = process.env.PROCTOR_SERVICE_URL || 'http://localhost:5000';
    private proctorApiKey = process.env.PROCTOR_API_KEY || 'dev-proctor-key';

    constructor(private prisma: PrismaService) { }

    /**
     * Forward a frame to the Python proctor service for analysis.
     */
    async analyzeFrame(attemptId: string, userId: string, frameBuffer: Buffer) {
        try {
            const FormData = (await import('form-data')).default;
            const form = new FormData();
            form.append('frame', frameBuffer, { filename: 'frame.jpg', contentType: 'image/jpeg' });
            form.append('attempt_id', attemptId);
            form.append('user_id', userId);

            const response = await axios.post(`${this.proctorApiUrl}/analyze-frame`, form, {
                headers: {
                    ...form.getHeaders(),
                    'x-api-key': this.proctorApiKey,
                },
                timeout: 5000,
            });

            const result = response.data;

            // Save proctor events based on flags
            if (result.flags && result.flags.length > 0) {
                for (const flag of result.flags) {
                    await this.createEvent(attemptId, flag as ProctorEventType, {
                        numFaces: result.num_faces,
                        matchScore: result.match_score,
                        riskScore: result.risk_score,
                    });
                }
            }

            // Update attempt risk score
            await this.updateRiskScore(attemptId);

            return result;
        } catch (err) {
            console.error('[Proctor] Frame analysis error:', err);
            return { error: 'Proctor service unavailable' };
        }
    }

    /**
     * Create a proctoring event.
     */
    async createEvent(
        attemptId: string,
        type: ProctorEventType,
        details?: Record<string, any>,
        severity?: number,
    ) {
        return this.prisma.proctorEvent.create({
            data: {
                attemptId,
                type,
                severity: severity || this.getSeverity(type),
                details: details || {},
            },
        });
    }

    /**
     * Aggregate risk score for an attempt based on events.
     */
    async updateRiskScore(attemptId: string) {
        const events = await this.prisma.proctorEvent.findMany({
            where: { attemptId },
        });

        // Simple risk aggregation
        let risk = 0;
        for (const event of events) {
            risk += event.severity * 0.05; // Each event contributes proportionally
        }
        risk = Math.min(risk, 1.0);

        await this.prisma.attempt.update({
            where: { id: attemptId },
            data: { riskScore: risk },
        });

        return risk;
    }

    /**
     * Get proctor report for an attempt.
     */
    async getReport(attemptId: string) {
        const events = await this.prisma.proctorEvent.findMany({
            where: { attemptId },
            orderBy: { timestamp: 'asc' },
        });

        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            select: { riskScore: true },
        });

        return {
            attemptId,
            totalEvents: events.length,
            riskScore: attempt?.riskScore || 0,
            events,
            summary: this.summarizeEvents(events),
        };
    }

    private getSeverity(type: ProctorEventType): number {
        const map: Record<string, number> = {
            NO_FACE: 3,
            MULTIPLE_FACES: 4,
            FACE_MISMATCH: 5,
            TAB_SWITCH: 4,
            SCREEN_CAPTURE: 5,
            NETWORK_DISCONNECT: 2,
            SEB_VIOLATION: 5,
            IP_CHANGE: 2,
        };
        return map[type] || 1;
    }

    private summarizeEvents(events: any[]) {
        const counts: Record<string, number> = {};
        for (const e of events) {
            counts[e.type] = (counts[e.type] || 0) + 1;
        }
        return counts;
    }
}
