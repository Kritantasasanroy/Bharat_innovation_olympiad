import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { AttemptStatus, ProctorEventType, ReviewStatus } from '@prisma/client';
import { ObjectStorageService } from '../common/services/object-storage.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Risk at or above which a finished attempt is put in front of a human.
 *
 * 0.5 is where the live monitoring console already draws "high risk", so the
 * queue and the dashboard agree about what counts as serious. It is a threshold
 * for *attention*, never for a decision — nothing is disqualified without a
 * person and a written reason.
 */
export const REVIEW_RISK_THRESHOLD = 0.5;

@Injectable()
export class ProctorService {
    private readonly logger = new Logger('ProctorService');

    constructor(
        private prisma: PrismaService,
        private storage: ObjectStorageService,
    ) {}

    /**
     * A webcam still, kept only when something actually went wrong.
     *
     * Registration promises — and the parent's DPDP consent says — that no photo
     * of the student is stored during normal proctoring, and that stays true:
     * nothing is captured on a timer, and a paper that raises no violation
     * produces no images at all. A frame is kept only at the instant a violation
     * is recorded, because "your face didn't match" with no evidence behind it
     * is not something a reviewer can act on and not something a student can
     * fairly appeal.
     *
     * The URL goes in the event's `details` rather than a column of its own, so
     * this needs no schema change and a snapshot can never outlive the event it
     * belongs to — `ProctorEvent` cascades on attempt deletion.
     *
     * Never throws. A snapshot that fails to upload must not lose the violation
     * it was attached to: the event is the record that matters, the image is
     * corroboration.
     */
    private async storeSnapshot(dataUrl: string): Promise<string | null> {
        return this.uploadDataUrl(dataUrl, 'proctor', 'bio/proctor-snapshots');
    }

    /**
     * Decodes a `data:image/...;base64,...` still and uploads it, or returns
     * null on anything malformed, oversized, or that fails to upload. Shared by
     * violation snapshots and the face-enrollment photo — same shape of input
     * (a `captureSnapshot()` data URL from the browser canvas), different folder.
     * Never throws: a snapshot that fails to upload must not lose the record it
     * was attached to (a violation event, or the enrollment itself).
     */
    private async uploadDataUrl(dataUrl: string, prefix: string, folder: string): Promise<string | null> {
        try {
            const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl.trim());
            if (!match) return null;
            const [, contentType, base64] = match;
            const buffer = Buffer.from(base64, 'base64');
            // A 320-wide JPEG is ~15 KB. Anything an order of magnitude past
            // that is not a proctor frame, and is not worth the storage.
            if (buffer.byteLength > 512 * 1024) return null;
            const { url } = await this.storage.uploadImageBuffer(
                buffer,
                `${prefix}-${Date.now()}.jpg`,
                contentType,
                folder,
            );
            return url;
        } catch (error) {
            this.logger.warn(`[${prefix}] upload failed: ${(error as Error).message}`);
            return null;
        }
    }

    // ── Face Enrollment ──

    /**
     * Stores the enrollment descriptor and, when supplied, the still it was
     * captured alongside — the photo later printed on the certificate.
     *
     * Disclosed in the guardian consent form (`GuardianForm.tsx`) and the
     * registration face-scan step: unlike a violation snapshot, this one photo
     * is not conditional on anything going wrong, it is taken once, on purpose,
     * because the certificate needs it. A photo upload failure never blocks
     * enrollment — the descriptor is what identity verification actually runs
     * on, so a lost photo costs the certificate a picture, not the exam.
     */
    async enrollFace(userId: string, descriptor: number[], photo?: string | null): Promise<void> {
        const buffer = Buffer.from(new Float32Array(descriptor).buffer);
        const facePhotoUrl = photo ? await this.uploadDataUrl(photo, 'enroll', 'bio/face-enrollment') : null;

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                faceEmbedding: buffer,
                ...(facePhotoUrl ? { facePhotoUrl } : {}),
            },
        });
        this.logger.log(
            `[Enroll] userId=${userId} descriptor(${descriptor.length}d) stored, photo=${facePhotoUrl ? 'yes' : 'no'}`,
        );
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
        /** Base64 data URL of a webcam frame. Only sent with counted violations. */
        snapshot?: string,
    ) {
        const snapshotUrl = snapshot ? await this.storeSnapshot(snapshot) : null;

        const event = await this.prisma.proctorEvent.create({
            data: {
                attemptId,
                type,
                severity: severity ?? this.getSeverity(type),
                details: { ...(details ?? {}), ...(snapshotUrl ? { snapshotUrl } : {}) },
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
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        classBand: true,
                        school: { select: { name: true } },
                    },
                },
                examInstance: {
                    include: {
                        exam: { select: { title: true, durationMinutes: true } },
                    },
                },
                proctorEvents: { orderBy: { timestamp: 'asc' } },
            },
        });

        if (!attempt) {
            return { attemptId, events: [], totalEvents: 0, riskScore: 0, summary: {} };
        }

        return {
            attemptId,
            student: {
                id: attempt.user.id,
                name: `${attempt.user.firstName} ${attempt.user.lastName}`.trim(),
                email: attempt.user.email,
                classBand: attempt.user.classBand,
                school: attempt.user.school?.name ?? null,
            },
            exam: {
                title: attempt.examInstance.exam.title,
                durationMinutes: attempt.examInstance.exam.durationMinutes,
            },
            attempt: {
                status: attempt.status,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                totalScore: attempt.totalScore,
                maxScore: attempt.maxScore,
                riskScore: attempt.riskScore ?? 0,
            },
            events: attempt.proctorEvents,
            totalEvents: attempt.proctorEvents.length,
            summary: this.summarizeEvents(attempt.proctorEvents),
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

    // ── Post-exam human review ────────────────────────────────────────────────

    /**
     * Flags a finished attempt for human review if its risk warrants one.
     *
     * Called on submit. Nothing is decided here — this only decides whether a
     * *person* should look, which is the whole point: "A human proctor reviews
     * serious cases as per certain logic, confirm cheating and prepares logs,
     * evidences and leading to disqualification."
     *
     * Never downgrades an existing verdict: an attempt a reviewer has already
     * cleared must not silently return to the queue if it is re-scored.
     */
    async flagForReviewIfRisky(attemptId: string): Promise<ReviewStatus> {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            select: { riskScore: true, reviewStatus: true },
        });
        if (!attempt) return ReviewStatus.NOT_REQUIRED;
        if (attempt.reviewStatus !== ReviewStatus.NOT_REQUIRED) return attempt.reviewStatus;

        if ((attempt.riskScore ?? 0) < REVIEW_RISK_THRESHOLD) return ReviewStatus.NOT_REQUIRED;

        await this.prisma.attempt.update({
            where: { id: attemptId },
            data: { reviewStatus: ReviewStatus.PENDING },
        });
        this.logger.log(`[Review] attempt=${attemptId} flagged (risk ${attempt.riskScore})`);
        return ReviewStatus.PENDING;
    }

    /**
     * The review queue: finished attempts a person should look at.
     *
     * Ordered by risk descending — a reviewer working top-down deals with the
     * most serious first, which matters when a season closes and there are more
     * flagged attempts than review hours.
     */
    async listReviewQueue(options: { status?: ReviewStatus; examInstanceId?: string } = {}) {
        const attempts = await this.prisma.attempt.findMany({
            where: {
                // Only finished attempts — an exam in progress has nothing to review
                // and its risk score is still moving.
                status: {
                    in: [
                        AttemptStatus.SUBMITTED,
                        AttemptStatus.AUTO_SUBMITTED,
                        AttemptStatus.DISQUALIFIED,
                    ],
                },
                reviewStatus: options.status ?? { not: ReviewStatus.NOT_REQUIRED },
                ...(options.examInstanceId ? { examInstanceId: options.examInstanceId } : {}),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        rollNumber: true,
                        classBand: true,
                        school: { select: { name: true } },
                    },
                },
                examInstance: { include: { exam: { select: { title: true } } } },
                proctorEvents: { select: { type: true } },
            },
            orderBy: [{ riskScore: 'desc' }, { submittedAt: 'asc' }],
        });

        return attempts.map((a) => ({
            attemptId: a.id,
            status: a.status,
            reviewStatus: a.reviewStatus,
            reviewedAt: a.reviewedAt,
            reviewNotes: a.reviewNotes,
            riskScore: a.riskScore ?? 0,
            submittedAt: a.submittedAt,
            totalScore: a.totalScore,
            maxScore: a.maxScore,
            student: {
                id: a.user.id,
                name: `${a.user.firstName} ${a.user.lastName}`.trim(),
                email: a.user.email,
                rollNumber: a.user.rollNumber,
                classBand: a.user.classBand,
                school: a.user.school?.name ?? null,
            },
            examTitle: a.examInstance.exam.title,
            examInstanceId: a.examInstanceId,
            totalEvents: a.proctorEvents.length,
            eventCounts: this.summarizeEvents(a.proctorEvents),
        }));
    }

    /**
     * Everything a reviewer needs to decide, in one call.
     *
     * The full event timeline rather than a summary: "prepares logs, evidences".
     * A decision to disqualify a child has to be defensible afterwards, and a
     * count of violations is not evidence — the sequence and timing is. Six
     * `LOOKING_AWAY` events spread over an hour is a student thinking; six in
     * ninety seconds is something else.
     */
    async getReviewEvidence(attemptId: string) {
        const report = await this.getReport(attemptId);

        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            select: {
                reviewStatus: true,
                reviewedBy: true,
                reviewedAt: true,
                reviewNotes: true,
                ipAddress: true,
                deviceFingerprint: true,
                user: { select: { rollNumber: true, section: true } },
            },
        });

        return {
            ...report,
            review: {
                status: attempt?.reviewStatus ?? ReviewStatus.NOT_REQUIRED,
                reviewedBy: attempt?.reviewedBy ?? null,
                reviewedAt: attempt?.reviewedAt ?? null,
                notes: attempt?.reviewNotes ?? null,
            },
            session: {
                ipAddress: attempt?.ipAddress ?? null,
                deviceFingerprint: attempt?.deviceFingerprint ?? null,
            },
            rollNumber: attempt?.user?.rollNumber ?? null,
            section: attempt?.user?.section ?? null,
            reviewThreshold: REVIEW_RISK_THRESHOLD,
        };
    }

    /**
     * Records a reviewer's verdict.
     *
     * Notes are mandatory for both outcomes, not just disqualification: a
     * clearance with no stated reason is just as unaccountable, and "why was this
     * cleared?" is the question asked when a pattern is spotted later.
     *
     * Disqualifying writes `AttemptStatus.DISQUALIFIED`, which is what actually
     * removes the attempt from normalization, ranking, certificates and the
     * school/partner exports — see the note on `SUBMITTED_STATUSES`.
     */
    async recordReview(
        attemptId: string,
        adminId: string,
        verdict: 'CLEARED' | 'DISQUALIFIED',
        notes: string,
    ) {
        if (!notes?.trim()) {
            throw new BadRequestException(
                'A written reason is required — a decision with no recorded reason cannot be defended in a grievance.',
            );
        }

        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            select: { id: true, status: true, examInstance: { select: { finalResultsReleasedAt: true } } },
        });
        if (!attempt) throw new NotFoundException('Attempt not found');

        // Disqualifying after the final report is out would silently move every
        // published rank below this student. Take the report back first.
        if (attempt.examInstance.finalResultsReleasedAt) {
            throw new ConflictException(
                'The final report for this exam is already published. Revoke it before changing a verdict, or the published ranks will silently change.',
            );
        }

        const now = new Date();
        const reviewStatus =
            verdict === 'DISQUALIFIED' ? ReviewStatus.DISQUALIFIED : ReviewStatus.CLEARED;

        const [updated] = await this.prisma.$transaction([
            this.prisma.attempt.update({
                where: { id: attemptId },
                data: {
                    reviewStatus,
                    reviewedBy: adminId,
                    reviewedAt: now,
                    reviewNotes: notes.trim(),
                    ...(verdict === 'DISQUALIFIED'
                        ? { status: AttemptStatus.DISQUALIFIED }
                        : {}),
                },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: `proctor.review.${verdict.toLowerCase()}`,
                    resource: 'attempt',
                    details: { attemptId, verdict, notes: notes.trim() },
                },
            }),
        ]);

        this.logger.log(`[Review] attempt=${attemptId} verdict=${verdict} by=${adminId}`);
        return {
            attemptId,
            status: updated.status,
            reviewStatus: updated.reviewStatus,
            reviewedAt: updated.reviewedAt,
        };
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
            WINDOW_BLUR: 3,
            EXIT_FULLSCREEN: 4,
            SCREEN_CAPTURE: 5,
            NETWORK_DISCONNECT: 2,
            IP_CHANGE: 2,
            SEB_VIOLATION: 5,
            // Deliberately the floor. Stillness is not misconduct, and scoring
            // it any higher would push honest students who read carefully over
            // the human-review threshold.
            INACTIVITY: 1,
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
