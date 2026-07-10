import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateCertificateNumber, isValidCertificateNumber } from './certificate-number';

const SUBMITTED_STATUSES = [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED];
const MAX_NUMBER_ATTEMPTS = 5;

/**
 * Certificate generation + public verification (spec Student §27/§28, Admin §21).
 *
 * Certificates may only exist for an exam instance whose results have been
 * *released* — a certificate is a public claim about a score, so it must not
 * pre-date the human release decision. Revocation is soft (the record stays and
 * the public endpoint reports it as revoked), which is the anti-fraud behaviour
 * the spec asks for: a revoked certificate must not silently 404.
 */
@Injectable()
export class CertificateService {
    constructor(private prisma: PrismaService) {}

    /**
     * Issue a certificate for every submitted attempt on a released instance
     * that does not have one yet. Idempotent — safe to re-run after a late
     * grievance-driven re-score.
     */
    async generateForInstance(examInstanceId: string, adminId: string) {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: examInstanceId },
            include: { exam: { select: { totalMarks: true } } },
        });
        if (!instance) throw new NotFoundException('Exam instance not found');
        if (!instance.resultsReleasedAt) {
            throw new ConflictException('Results must be released before certificates can be issued.');
        }

        const attempts = await this.prisma.attempt.findMany({
            where: {
                examInstanceId,
                status: { in: SUBMITTED_STATUSES },
                certificate: { is: null },
            },
            select: {
                id: true,
                userId: true,
                totalScore: true,
                maxScore: true,
                normalizedScore: true,
                percentile: true,
                rank: true,
            },
        });

        const year = new Date().getFullYear();
        let issued = 0;
        for (const attempt of attempts) {
            await this.createWithUniqueNumber(year, {
                attemptId: attempt.id,
                userId: attempt.userId,
                examInstanceId,
                score: attempt.normalizedScore ?? attempt.totalScore ?? 0,
                maxScore: attempt.maxScore ?? instance.exam.totalMarks ?? 0,
                percentile: attempt.percentile,
                rank: attempt.rank,
            });
            issued += 1;
        }

        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'certificates.generated',
                resource: 'exam-instance',
                details: { examInstanceId, issued },
            },
        });

        return { examInstanceId, issued, skipped: 0 };
    }

    /** Retry on the (astronomically unlikely) unique-constraint collision. */
    private async createWithUniqueNumber(
        year: number,
        data: {
            attemptId: string;
            userId: string;
            examInstanceId: string;
            score: number;
            maxScore: number;
            percentile: number | null;
            rank: number | null;
        },
    ) {
        for (let i = 0; i < MAX_NUMBER_ATTEMPTS; i += 1) {
            try {
                return await this.prisma.certificate.create({
                    data: { ...data, certificateNumber: generateCertificateNumber(year) },
                });
            } catch (error: any) {
                const isUniqueViolation = error?.code === 'P2002';
                if (!isUniqueViolation) throw error;
                // Collision on certificateNumber — try a fresh number.
                if (error?.meta?.target?.includes?.('attemptId')) {
                    throw new ConflictException('Certificate already exists for this attempt.');
                }
            }
        }
        throw new ConflictException('Could not allocate a unique certificate number.');
    }

    /**
     * PUBLIC verification. Never requires auth and never leaks anything beyond
     * what a certificate holder already prints on the certificate itself.
     * An unknown or malformed number is reported as simply "not valid" — we do
     * not distinguish the two, so the endpoint cannot be used as an oracle.
     */
    async verify(certificateNumber: string) {
        const normalized = certificateNumber.trim().toUpperCase();
        if (!isValidCertificateNumber(normalized)) {
            return { valid: false as const, reason: 'NOT_FOUND' as const };
        }

        const certificate = await this.prisma.certificate.findUnique({
            where: { certificateNumber: normalized },
            include: {
                user: { select: { firstName: true, lastName: true } },
                examInstance: { include: { exam: { select: { title: true } } } },
            },
        });
        if (!certificate) return { valid: false as const, reason: 'NOT_FOUND' as const };

        if (certificate.revokedAt) {
            return {
                valid: false as const,
                reason: 'REVOKED' as const,
                certificateNumber: certificate.certificateNumber,
                revokedAt: certificate.revokedAt,
                revokeReason: certificate.revokeReason,
            };
        }

        return {
            valid: true as const,
            certificateNumber: certificate.certificateNumber,
            holderName: `${certificate.user.firstName} ${certificate.user.lastName}`.trim(),
            examTitle: certificate.examInstance.exam.title,
            score: certificate.score,
            maxScore: certificate.maxScore,
            percentile: certificate.percentile,
            rank: certificate.rank,
            issuedAt: certificate.issuedAt,
        };
    }

    /** A student's own certificates. */
    async listForUser(userId: string) {
        return this.prisma.certificate.findMany({
            where: { userId },
            orderBy: { issuedAt: 'desc' },
            include: { examInstance: { include: { exam: { select: { title: true } } } } },
        });
    }

    /** One certificate, ownership-checked — backs the printable certificate page. */
    async getForUser(userId: string, id: string) {
        const certificate = await this.prisma.certificate.findUnique({
            where: { id },
            include: {
                user: { select: { firstName: true, lastName: true } },
                examInstance: { include: { exam: { select: { title: true } } } },
            },
        });
        if (!certificate || certificate.userId !== userId) {
            throw new NotFoundException('Certificate not found');
        }
        return certificate;
    }

    async listForInstance(examInstanceId: string) {
        return this.prisma.certificate.findMany({
            where: { examInstanceId },
            orderBy: { issuedAt: 'desc' },
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
        });
    }

    /** Soft revoke — the public endpoint then reports the certificate as revoked. */
    async revoke(id: string, reason: string, adminId: string) {
        if (!reason?.trim()) throw new BadRequestException('A reason is required to revoke.');
        const certificate = await this.prisma.certificate.findUnique({ where: { id } });
        if (!certificate) throw new NotFoundException('Certificate not found');
        if (certificate.revokedAt) throw new ConflictException('Certificate is already revoked.');

        const updated = await this.prisma.certificate.update({
            where: { id },
            data: { revokedAt: new Date(), revokeReason: reason.trim() },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'certificate.revoked',
                resource: 'certificate',
                details: { certificateId: id, certificateNumber: certificate.certificateNumber, reason: reason.trim() },
            },
        });
        return updated;
    }
}
