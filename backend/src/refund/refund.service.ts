import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { RefundStatus } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateRefundEligibility } from './refund-eligibility';

/**
 * Refund request -> automatic eligibility -> human review -> issuance
 * (spec Student §13/§14, Admin §22/§23).
 *
 * Eligibility is evaluated twice on purpose: once to inform the student at
 * request time, and again at approval time, because the cutoff may have passed
 * in between. Issuance is automatic on approval (spec §23) and reuses the
 * existing Razorpay refund path.
 */
@Injectable()
export class RefundService {
    private readonly logger = new Logger(RefundService.name);

    constructor(
        private prisma: PrismaService,
        private paymentService: PaymentService,
    ) {}

    /** Load the payment plus everything eligibility depends on. */
    private async loadPaymentContext(paymentId: string) {
        return this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                booking: { include: { slot: { include: { examInstance: true } } } },
            },
        });
    }

    private eligibilityFor(payment: NonNullable<Awaited<ReturnType<RefundService['loadPaymentContext']>>>) {
        return evaluateRefundEligibility({
            paymentStatus: payment.status,
            bookingStatus: payment.booking?.status ?? null,
            examStartsAt: payment.booking?.slot?.startsAt ?? null,
            now: new Date(),
        });
    }

    /** STUDENT — raise a refund request. The eligibility verdict is snapshotted. */
    async request(userId: string, paymentId: string, reason: string) {
        if (!reason?.trim()) throw new BadRequestException('A reason is required.');

        const payment = await this.loadPaymentContext(paymentId);
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.userId !== userId) throw new NotFoundException('Payment not found');

        const existing = await this.prisma.refundRequest.findUnique({ where: { paymentId } });
        if (existing) throw new ConflictException('A refund request already exists for this payment.');

        const verdict = this.eligibilityFor(payment);

        return this.prisma.refundRequest.create({
            data: {
                userId,
                paymentId,
                reason: reason.trim(),
                eligible: verdict.eligible,
                eligibilityNote: verdict.note,
            },
        });
    }

    async listForUser(userId: string) {
        return this.prisma.refundRequest.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { payment: { select: { amount: true, status: true, createdAt: true } } },
        });
    }

    /** ADMIN — the review queue. */
    async listAll(status?: RefundStatus) {
        return this.prisma.refundRequest.findMany({
            where: status ? { status } : {},
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                payment: { select: { amount: true, status: true, razorpayPaymentId: true } },
            },
        });
    }

    /**
     * ADMIN — approve or reject. Approving re-checks eligibility, then issues
     * the refund immediately (spec §23 "Refund / Credit Issuance", Automatic).
     * If Razorpay fails, the request stays APPROVED so it can be retried rather
     * than being silently marked ISSUED.
     */
    async decide(id: string, decision: 'APPROVED' | 'REJECTED', reason: string, adminId: string) {
        if (!reason?.trim()) throw new BadRequestException('A decision reason is required.');

        const request = await this.prisma.refundRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Refund request not found');
        if (request.status !== RefundStatus.REQUESTED) {
            throw new ConflictException(`This request was already decided (${request.status}).`);
        }

        if (decision === 'REJECTED') {
            const updated = await this.prisma.refundRequest.update({
                where: { id },
                data: {
                    status: RefundStatus.REJECTED,
                    decisionReason: reason.trim(),
                    decidedBy: adminId,
                    decidedAt: new Date(),
                },
            });
            await this.audit(adminId, 'refund.rejected', id, reason.trim());
            return updated;
        }

        // Re-check: the cutoff may have passed since the request was raised.
        const payment = await this.loadPaymentContext(request.paymentId);
        if (!payment) throw new NotFoundException('Payment not found');
        const verdict = this.eligibilityFor(payment);
        if (!verdict.eligible) {
            throw new ConflictException(`No longer eligible for a refund: ${verdict.note}`);
        }

        await this.prisma.refundRequest.update({
            where: { id },
            data: {
                status: RefundStatus.APPROVED,
                decisionReason: reason.trim(),
                decidedBy: adminId,
                decidedAt: new Date(),
            },
        });
        await this.audit(adminId, 'refund.approved', id, reason.trim());

        // Automatic issuance.
        try {
            await this.paymentService.adminRefund(request.paymentId);
        } catch (error) {
            this.logger.error(
                `Refund ${id} approved but issuance failed: ${(error as Error).message}`,
            );
            return this.prisma.refundRequest.findUniqueOrThrow({ where: { id } });
        }

        const issued = await this.prisma.refundRequest.update({
            where: { id },
            data: { status: RefundStatus.ISSUED, refundedAt: new Date() },
        });
        await this.audit(adminId, 'refund.issued', id, reason.trim());
        return issued;
    }

    private audit(adminId: string, action: string, refundRequestId: string, reason: string) {
        return this.prisma.auditLog.create({
            data: { userId: adminId, action, resource: 'refund-request', details: { refundRequestId, reason } },
        });
    }
}
