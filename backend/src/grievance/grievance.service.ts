import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, GrievanceStatus, GrievanceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A grievance can only be decided once, out of these states. */
export const DECIDABLE_STATUSES: GrievanceStatus[] = [GrievanceStatus.OPEN, GrievanceStatus.IN_REVIEW];

/** The two terminal states a human decision can move a grievance into. */
export type GrievanceDecision = Extract<GrievanceStatus, 'RESOLVED' | 'REJECTED'>;

/**
 * Grievance / re-attempt handling (spec Student §29, Admin §24).
 *
 * A student raises a complaint or asks for a re-attempt; staff resolve or
 * reject it with a mandatory written resolution. Approving a REATTEMPT actually
 * grants one: the attempt is reset to NOT_STARTED so the student can sit it
 * again (an `Attempt` is unique per student+instance, so there is no second row
 * to create).
 *
 * That reset is destructive, so the original submission (score, timestamps,
 * answer count) is snapshotted into the audit log *before* it is cleared —
 * a re-attempt must never quietly erase the evidence of the first one.
 */
@Injectable()
export class GrievanceService {
    constructor(private prisma: PrismaService) {}

    /** STUDENT — raise a grievance or request a re-attempt. */
    async create(
        userId: string,
        input: { type: GrievanceType; subject: string; description: string; attemptId?: string },
    ) {
        if (!input.subject?.trim() || !input.description?.trim()) {
            throw new BadRequestException('A subject and description are required.');
        }

        if (input.attemptId) {
            const attempt = await this.prisma.attempt.findUnique({ where: { id: input.attemptId } });
            if (!attempt || attempt.userId !== userId) {
                throw new NotFoundException('Attempt not found');
            }
        } else if (input.type === GrievanceType.REATTEMPT) {
            throw new BadRequestException('A re-attempt request must reference an attempt.');
        }

        return this.prisma.grievance.create({
            data: {
                userId,
                type: input.type,
                subject: input.subject.trim(),
                description: input.description.trim(),
                ...(input.attemptId ? { attemptId: input.attemptId } : {}),
            },
        });
    }

    async listForUser(userId: string) {
        return this.prisma.grievance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }

    /** ADMIN — the support queue. */
    async listAll(status?: GrievanceStatus) {
        return this.prisma.grievance.findMany({
            where: status ? { status } : {},
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                attempt: { select: { id: true, totalScore: true, examInstanceId: true } },
            },
        });
    }

    /**
     * ADMIN — resolve or reject. Resolving a REATTEMPT grievance grants the
     * re-attempt as part of the same transaction.
     */
    async decide(id: string, status: GrievanceDecision, resolution: string, adminId: string) {
        if (!resolution?.trim()) throw new BadRequestException('A resolution is required.');

        const grievance = await this.prisma.grievance.findUnique({
            where: { id },
            include: { attempt: { include: { _count: { select: { items: true } } } } },
        });
        if (!grievance) throw new NotFoundException('Grievance not found');
        if (!DECIDABLE_STATUSES.includes(grievance.status)) {
            throw new ConflictException(`This grievance was already decided (${grievance.status}).`);
        }

        const grantsReattempt =
            status === GrievanceStatus.RESOLVED &&
            grievance.type === GrievanceType.REATTEMPT &&
            Boolean(grievance.attempt);

        const now = new Date();
        const writes: any[] = [
            this.prisma.grievance.update({
                where: { id },
                data: { status, resolution: resolution.trim(), decidedBy: adminId, decidedAt: now },
            }),
            this.prisma.auditLog.create({
                data: {
                    userId: adminId,
                    action: `grievance.${status.toLowerCase()}`,
                    resource: 'grievance',
                    details: {
                        grievanceId: id,
                        type: grievance.type,
                        resolution: resolution.trim(),
                        grantsReattempt,
                        // Snapshot the submission we are about to clear.
                        ...(grantsReattempt && grievance.attempt
                            ? {
                                  clearedAttempt: {
                                      id: grievance.attempt.id,
                                      totalScore: grievance.attempt.totalScore,
                                      maxScore: grievance.attempt.maxScore,
                                      submittedAt: grievance.attempt.submittedAt,
                                      answeredQuestions: grievance.attempt._count.items,
                                  },
                              }
                            : {}),
                    },
                },
            }),
        ];

        if (grantsReattempt && grievance.attempt) {
            const attemptId = grievance.attempt.id;
            writes.push(
                this.prisma.attemptItem.deleteMany({ where: { attemptId } }),
                this.prisma.attempt.update({
                    where: { id: attemptId },
                    data: {
                        status: AttemptStatus.NOT_STARTED,
                        startedAt: null,
                        submittedAt: null,
                        totalScore: null,
                        maxScore: null,
                        normalizedScore: null,
                        percentile: null,
                        rank: null,
                    },
                }),
            );
        }

        const [updated] = await this.prisma.$transaction(writes);
        return updated;
    }
}
