import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccessPassStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

/**
 * The two delayed lifecycle mails — BIO-STU-004 (preparation resources, T+1
 * after registration completes) and BIO-STU-005 (parent consent received, T+2,
 * addressed to the guardian).
 *
 * ## Why a sweeper
 *
 * Same shape as the payment-pending and reminder sweepers: a `setTimeout` per
 * student would have to survive days of deploys, while an hourly "who crossed
 * the mark and has not been mailed?" query is stateless and self-healing. The
 * `EmailMessage` claim inside {@link NotificationService.deliverOnce} makes
 * every re-run idempotent, so the windows below are deliberately open-ended
 * (`grantedAt <= 24h ago`) — a student who crossed the mark during a missed
 * sweep is caught by the next one, not skipped.
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
            this.logger.warn('STUDENT_NUDGES_ENABLED=false — the T+1/T+2 mail sweeper is off.');
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
        try {
            await this.sendParentConsentThanks();
        } catch (err) {
            this.logger.error(`T+2 consent sweep failed: ${(err as Error).message}`);
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

    /**
     * BIO-STU-005 — every recorded parental consent at least two days old,
     * addressed to the guardian's own inbox. Deduped on the GuardianProfile id,
     * so an edited profile never re-mails.
     */
    private async sendParentConsentThanks(): Promise<void> {
        const now = Date.now();
        const twoDaysAgo = new Date(now - 2 * StudentNudgesService.DAY_MS);
        // Same week-of-catch-up bound as the prep sweep.
        const weekAgo = new Date(now - 7 * StudentNudgesService.DAY_MS);
        const profiles = await this.prisma.guardianProfile.findMany({
            where: { parentalConsentAt: { lte: twoDaysAgo, gte: weekAgo } },
            select: {
                id: true,
                guardianFirstName: true,
                guardianLastName: true,
                guardianEmail: true,
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        rollNumber: true,
                        classBand: true,
                        school: { select: { name: true } },
                    },
                },
            },
        });
        let sent = 0;
        for (const profile of profiles) {
            const ok = await this.notifications.sendParentConsentReceived(profile.guardianEmail, {
                userId: profile.user.id,
                guardianProfileId: profile.id,
                parentName: `${profile.guardianFirstName} ${profile.guardianLastName}`.trim(),
                studentName: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
                rollNumber: profile.user.rollNumber,
                grade: profile.user.classBand,
                schoolName: profile.user.school?.name ?? null,
            });
            if (ok) sent++;
        }
        if (profiles.length) {
            this.logger.log(`T+2 consent sweep: ${sent}/${profiles.length} mailed.`);
        }
    }
}
