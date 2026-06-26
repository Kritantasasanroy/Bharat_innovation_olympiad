import { Injectable, Logger } from '@nestjs/common';
import { AttemptStatus, ProctorEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProctorService {
    private readonly logger = new Logger('ProctorService');

    constructor(private prisma: PrismaService) {}

    // ── Face Enrollment ──

    async enrollFace(userId: string, descriptor: number[]): Promise<void> {
        const buffer = Buffer.from(new Float32Array(descriptor).buffer);
        await this.prisma.user.update({
            where: { id: userId },
            data: { faceEmbedding: buffer },
        });
        this.logger.log(`[Enroll] userId=${userId} descriptor(${descriptor.length}d) stored`);
    }

    async getEnrollmentStatus(userId: string): Promise<{ enrolled: boolean }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { faceEmbedding: true },
        });
        return { enrolled: !!user?.faceEmbedding };
    }

    async verifyFace(
        userId: string,
        descriptor: number[],
    ): Promise<{ match: boolean; distance: number }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { faceEmbedding: true },
        });

        if (!user?.faceEmbedding) {
            return { match: false, distance: 1.0 };
        }

        const stored = new Float32Array(user.faceEmbedding.buffer);
        const live = new Float32Array(descriptor);
        const distance = this.euclideanDistance(stored, live);
        const match = distance < 0.5;

        this.logger.log(`[Verify] userId=${userId} distance=${distance.toFixed(3)} match=${match}`);
        return { match, distance };
    }

    // ── Event Handling ──

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

    // ── Admin Live Monitoring ──

    async getLiveMonitoring(sinceMinutes = 5) {
        const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

        const attempts = await this.prisma.attempt.findMany({
            where: { status: AttemptStatus.IN_PROGRESS },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                examInstance: {
                    include: { exam: { select: { title: true } } },
                },
                proctorEvents: {
                    where: { timestamp: { gte: since } },
                    orderBy: { timestamp: 'desc' },
                    take: 20,
                },
            },
            orderBy: { startedAt: 'asc' },
        });

        return attempts.map((a) => ({
            attemptId: a.id,
            userId: a.userId,
            studentName: `${a.user.firstName} ${a.user.lastName}`.trim(),
            studentEmail: a.user.email,
            examTitle: a.examInstance.exam.title,
            startedAt: a.startedAt,
            riskScore: a.riskScore ?? 0,
            recentEvents: a.proctorEvents,
            eventCounts: this.summarizeEvents(a.proctorEvents),
        }));
    }

    // ── Helpers ──

    private euclideanDistance(a: Float32Array, b: Float32Array): number {
        let sum = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    private getSeverity(type: ProctorEventType): number {
        const map: Partial<Record<ProctorEventType, number>> = {
            NO_FACE: 3,
            MULTIPLE_FACES: 4,
            FACE_MISMATCH: 5,
            LOOKING_AWAY: 2,
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
