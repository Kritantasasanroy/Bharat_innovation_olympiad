import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccessPassStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

/**
 * The delayed lifecycle mail — BIO-STU-004 (preparation resources, T+1 after
 * registration completes).
 *
 * ## Why a sweeper
 *
 * Same shape as the payment-pending and reminder sweepers: a `setTimeout` per
 * student would have to survive days of deploys, while an hourly "who crossed
 * the mark and has not been mailed?" query is stateless and self-healing. The
 * `EmailMessage` claim inside {@link NotificationService.deliverOnce} makes
 * every re-run idempotent, so the window below is deliberately open-ended
 * (`grantedAt <= 24h ago`) — a student who crossed the mark during a missed
 * sweep is caught by the next one, not skipped.
 *
 * (The T+2 parent-consent mail went away when parent/guardian details were
 * removed from identification — there is no guardian address to send it to.)
 */
@Injectable()
export class StudentNudgesService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(StudentNudgesService.name);
    private timer: NodeJS.Timeout | null = null;

    private static readonly SWEEP_INTERVAL_MS = 60 * 60 * 1000;
    private static readonly FIRST_SWEEP_DELAY_MS = 60_000;
    private static readonly DAY_MS = 24 * 60 * 60 * 1000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationService,
    ) {}

    onModuleInit() {
        if (process.env.STUDENT_NUDGES_ENABLED?.trim().toLowerCase() === 'false') {
            this.logger.warn('STUDENT_NUDGES_ENABLED=false — the T+1 mail sweeper is off.');
            return;
        }
        const first = setTimeout(() => {
            void this.sweep();
            this.timer = setInterval(
                () => void this.sweep(),
                StudentNudgesService.SWEEP_INTERVAL_MS,
            );
            this.timer.unref?.();
        }, StudentNudgesService.FIRST_SWEEP_DELAY_MS);
        first.unref?.();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    async sweep(): Promise<void> {
        try {
            await this.sendPrepResources();
        } catch (err) {
            this.logger.error(`T+1 prep sweep failed: ${(err as Error).message}`);
        }
    }

    /**
     * BIO-STU-004 — everyone whose pass has been ACTIVE for at least a day.
     * The resources mail deliberately waits a day so it does not drown the
     * registration confirmation in the same inbox burst.
     */
    private async sendPrepResources(): Promise<void> {
        const now = Date.now();
        const dayAgo = new Date(now - StudentNudgesService.DAY_MS);
        // A week of catch-up only: a pass granted months ago getting "your
        // journey has begun" is worse than skipping the mail.
        const weekAgo = new Date(now - 7 * StudentNudgesService.DAY_MS);
        const passes = await this.prisma.accessPass.findMany({
            where: {
                status: AccessPassStatus.ACTIVE,
                grantedAt: { lte: dayAgo, gte: weekAgo },
            },
            select: {
                user: { select: { id: true, firstName: true, email: true } },
            },
        });
        let sent = 0;
        for (const pass of passes) {
            const ok = await this.notifications.sendPrepResources(pass.user.email, {
                firstName: pass.user.firstName,
                userId: pass.user.id,
            });
            if (ok) sent++;
        }
        if (passes.length) {
            this.logger.log(`T+1 prep sweep: ${sent}/${passes.length} mailed.`);
        }
    }
}
