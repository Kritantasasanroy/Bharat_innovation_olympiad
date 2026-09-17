import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccessPassStatus, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { SmsService } from './sms.service';
import { WhatsAppService } from './whatsapp.service';

/**
 * The unpaid-registration nudge (`bio_paymentpendinglogin`).
 *
 * ## What it is for
 *
 * A student who completes registration — phone OTP verified — but never pays
 * gets one SMS an hour later: "your registration is incomplete as payment is
 * pending", with the login link and the support number in case a payment was
 * actually deducted. The hour is measured from `User.createdAt`, which is when
 * the registration row appears.
 *
 * ## Why a sweeper, not a timer per registration
 *
 * Same reason as the T-1 reminder sweeper: a `setTimeout` per student would
 * have to survive restarts and deploys, while an hourly "who crossed the
 * one-hour mark and has not been told?" query is stateless, restart-safe and
 * self-healing. The dedupe row inside {@link SmsService.sendPaymentPending}
 * (`paypending:<userId>`) makes re-runs harmless.
 *
 * ## Who is excluded
 *
 * - Users with a `phone` still null — the OTP was never completed, so this is
 *   not a "registered" student yet.
 * - Anyone with an ACTIVE access pass — paid.
 * - Anyone with a PAID payment row even without an active pass — refunded or
 *   revoked students must not be told to pay again.
 *
 * ## `setInterval`, not `@nestjs/schedule`
 *
 * The backend has no scheduler dependency; one recurring job does not earn
 * one. The interval is unref'd so it never holds a shutting-down process open.
 */
@Injectable()
export class PaymentPendingSmsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PaymentPendingSmsService.name);
    private timer: NodeJS.Timeout | null = null;

    /** Hourly — the one-hour mark has ±1h slack, which is plenty. */
    private static readonly SWEEP_INTERVAL_MS = 60 * 60 * 1000;

    /** Let the app finish booting before the first sweep touches the database. */
    private static readonly FIRST_SWEEP_DELAY_MS = 60_000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly sms: SmsService,
        private readonly whatsapp: WhatsAppService,
        private readonly notifications: NotificationService,
    ) {}

    onModuleInit() {
        if (process.env.PAYMENT_PENDING_SMS_ENABLED?.trim().toLowerCase() === 'false') {
            this.logger.warn('PAYMENT_PENDING_SMS_ENABLED=false — the unpaid-registration sweeper is off.');
            return;
        }

        const first = setTimeout(() => {
            void this.sweep();
            this.timer = setInterval(
                () => void this.sweep(),
                PaymentPendingSmsService.SWEEP_INTERVAL_MS,
            );
            this.timer.unref?.();
        }, PaymentPendingSmsService.FIRST_SWEEP_DELAY_MS);
        first.unref?.();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /**
     * Nudge every OTP-verified student who registered more than an hour ago
     * and has never paid. Never throws — an unhandled rejection from a
     * background sweep would take the process down.
     */
    async sweep(): Promise<{ considered: number; sent: number; skipped: number; failed: number }> {
        const summary = { considered: 0, sent: 0, skipped: 0, failed: 0 };

        try {
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const users = await this.prisma.user.findMany({
                where: {
                    role: Role.STUDENT,
                    phone: { not: null },
                    createdAt: { lte: hourAgo },
                    // `isNot` on a nullable to-one: absent pass or not ACTIVE.
                    accessPass: { isNot: { status: AccessPassStatus.ACTIVE } },
                    payments: { none: { status: PaymentStatus.PAID } },
                },
                select: { id: true, firstName: true, email: true, phone: true, phoneRaw: true },
            });

            summary.considered = users.length;
            if (!users.length) return summary;

            this.logger.log(
                `Payment-pending sweep: ${users.length} OTP-verified student(s) past the 1h mark with no payment.`,
            );

            for (const user of users) {
                const outcome = await this.sms.sendPaymentPending({
                    userId: user.id,
                    phone: user.phone,
                    phoneRaw: user.phoneRaw,
                });
                // The WhatsApp twin (`bio_payment`) — same dedupe key shape, so
                // a re-sweep never double-sends on either channel.
                await this.whatsapp.sendPaymentPending({
                    userId: user.id,
                    phone: user.phone,
                    phoneRaw: user.phoneRaw,
                    firstName: user.firstName,
                });
                // And the email (BIO-STU-002), deduped on the user.
                await this.notifications.sendPaymentPendingEmail(user.email, {
                    firstName: user.firstName,
                    userId: user.id,
                });
                // `sendPaymentPending` enqueues on the 30s-spaced queue, so
                // "sent" here means "claimed for the queue".
                if (outcome.queued || outcome.sent) summary.sent++;
                else if (outcome.error) summary.failed++;
                else summary.skipped++;
            }

            this.logger.log(
                `Payment-pending sweep: ${summary.sent} queued, ${summary.skipped} skipped, ${summary.failed} failed.`,
            );
        } catch (err) {
            this.logger.error(`Payment-pending sweep failed: ${(err as Error).message}`);
        }

        return summary;
    }
}
