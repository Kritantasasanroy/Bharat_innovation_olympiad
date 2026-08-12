import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, WhatsAppStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    ConsoleWhatsAppProvider,
    WatiParam,
    WatiWhatsAppProvider,
    WhatsAppDiagnostics,
    WhatsAppProvider,
} from './whatsapp.provider';
import {
    WHATSAPP_TEMPLATES,
    reminderParams,
    resultParams,
    scheduleParams,
    submissionParams,
} from './whatsapp.templates';

/** Why a send did not happen, when it did not happen for a reason worth naming. */
export type WhatsAppSkipReason = 'no-phone' | 'already-sent' | 'disabled';

export interface WhatsAppOutcome {
    sent: boolean;
    skipped?: WhatsAppSkipReason;
    error?: string;
}

/**
 * WhatsApp notifications for the four moments a student needs one.
 *
 * ## The contract every method here keeps
 *
 * **Never throws.** Every caller is a business action that has already
 * succeeded: the paper is submitted, the seat is booked, the results are
 * published. Failing a submit because WATI timed out would take an exam away
 * from a student over a message, so failures are recorded in `WhatsAppMessage`
 * and returned, never raised. This mirrors `NotificationService.deliver` and
 * exists for the same reason.
 *
 * **Sends at most once.** The dedupe row is written before the send, so a
 * restart mid-fan-out or a reminder sweeper that ticks twice cannot double-
 * message anyone. See the `WhatsAppMessage` model comment for what "once" means
 * per template.
 *
 * ## Why this is separate from `NotificationService`
 *
 * That class owns email and the OTP gateways, and its methods compose prose.
 * Nothing here composes anything — a WhatsApp message is an approved template
 * plus variables, and the approval is Meta's, not ours. Keeping them apart is
 * what stops someone "improving the wording" of a message that legally cannot
 * change without re-review.
 */
@Injectable()
export class WhatsAppService implements OnModuleInit {
    private readonly logger = new Logger(WhatsAppService.name);
    private provider: WhatsAppProvider = new ConsoleWhatsAppProvider();
    /** Set from WHATSAPP_ENABLED — the kill switch for a live cohort. */
    private enabled = true;

    constructor(private readonly prisma: PrismaService) {}

    onModuleInit() {
        // Both are tenant-specific: the endpoint carries the tenant id in its
        // path, so one without the other is never a working configuration.
        const endpoint = process.env.WATI_API_ENDPOINT?.trim();
        const token = process.env.WATI_ACCESS_TOKEN?.trim();
        this.enabled = process.env.WHATSAPP_ENABLED?.trim().toLowerCase() !== 'false';

        if (endpoint && token) {
            this.provider = new WatiWhatsAppProvider(endpoint, token);
            this.logger.log(`WhatsApp provider: wati (${endpoint})`);
        } else {
            this.logger.warn(
                'WATI_API_ENDPOINT / WATI_ACCESS_TOKEN not set — WhatsApp messages will be ' +
                    'logged, not delivered.',
            );
        }

        if (!this.enabled) {
            this.logger.warn('WHATSAPP_ENABLED=false — no WhatsApp message will be sent.');
        }
    }

    /** True when a real gateway is configured and the kill switch is off. */
    get isLive(): boolean {
        return this.enabled && this.provider.name !== 'console';
    }

    async diagnostics(): Promise<WhatsAppDiagnostics & { enabled: boolean }> {
        return { ...(await this.provider.diagnostics()), enabled: this.enabled };
    }

    // ── The four student-facing messages ─────────────────────────────────────
    // Each one is (student, the facts) → an approved template. The dedupe key is
    // chosen so that "the same event" can never be messaged twice while a
    // genuinely new event (a rescheduled slot, a re-published result) can.

    /** Paper submitted — manual or auto. Deduped on the attempt. */
    async sendSubmission(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        firstName: string;
        attemptId: string;
        submittedAt: Date;
    }): Promise<WhatsAppOutcome> {
        return this.send({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: WHATSAPP_TEMPLATES.submission,
            dedupeKey: vars.attemptId,
            params: submissionParams({ firstName: vars.firstName, submittedAt: vars.submittedAt }),
        });
    }

    /**
     * Seat confirmed — the student's date and time.
     *
     * Deduped on booking *and slot*, not booking alone: an admin reassigning a
     * student to a different slot is exactly the case where a second schedule
     * message is the right thing to send, and keying on the booking would
     * silently suppress it and leave them turning up on the wrong day.
     */
    async sendSchedule(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        firstName: string;
        bookingId: string;
        slotId: string;
        startsAt: Date;
    }): Promise<WhatsAppOutcome> {
        return this.send({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: WHATSAPP_TEMPLATES.schedule,
            dedupeKey: `${vars.bookingId}:${vars.slotId}`,
            params: scheduleParams({ firstName: vars.firstName, startsAt: vars.startsAt }),
        });
    }

    /**
     * Final report published. Deduped on the attempt.
     *
     * Only ever sent for a *final* publish, never a provisional one: the approved
     * body says "verified score and rank", and a rank that later moves because a
     * grievance was upheld would make that a lie.
     */
    async sendResult(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        firstName: string;
        attemptId: string;
        percentile: number;
        rank: number;
    }): Promise<WhatsAppOutcome> {
        return this.send({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: WHATSAPP_TEMPLATES.result,
            dedupeKey: vars.attemptId,
            params: resultParams({
                firstName: vars.firstName,
                percentile: vars.percentile,
                rank: vars.rank,
            }),
        });
    }

    /**
     * The day-before reminder. Deduped on the booking *and* the exam's IST date,
     * so a student moved to a new slot is reminded again about the new one.
     */
    async sendReminder(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        firstName: string;
        bookingId: string;
        startsAt: Date;
        /** `YYYY-MM-DD` in IST — supplied by the sweeper, which already computed it. */
        examDateKey: string;
    }): Promise<WhatsAppOutcome> {
        return this.send({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: WHATSAPP_TEMPLATES.reminder,
            dedupeKey: `${vars.bookingId}:${vars.examDateKey}`,
            params: reminderParams({ firstName: vars.firstName, startsAt: vars.startsAt }),
        });
    }

    /**
     * Send one template, once, and record what happened.
     *
     * The claim-then-send order is the whole point. `create` on the unique
     * `(template, dedupeKey)` index is the lock: whoever wins it sends, everyone
     * else sees P2002 and returns `already-sent`. Doing it the other way round —
     * send, then record — leaves a window in which a crash means the student is
     * messaged again on the next run.
     */
    private async send(input: {
        userId: string;
        phone: string | null | undefined;
        /** Unverified fallback stored at registration. Used when `phone` is absent. */
        phoneRaw?: string | null | undefined;
        template: string;
        dedupeKey: string;
        params: WatiParam[];
    }): Promise<WhatsAppOutcome> {
        const { userId, template, dedupeKey, params } = input;

        // Not an error: a phone number is optional on `User`, and plenty of
        // students registered before it was collected. They still get the email.
        // Fall back to phoneRaw (unverified) so students who typed a number but
        // did not complete OTP still receive WhatsApp notifications.
        const phone = (input.phone?.trim()) || (input.phoneRaw?.trim());
        if (!phone) return { sent: false, skipped: 'no-phone' };

        if (!this.enabled) return { sent: false, skipped: 'disabled' };

        let claimId: string;
        try {
            const claim = await this.prisma.whatsAppMessage.create({
                data: { userId, template, dedupeKey, phone, status: WhatsAppStatus.PENDING },
                select: { id: true },
            });
            claimId = claim.id;
        } catch (err) {
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002'
            ) {
                return { sent: false, skipped: 'already-sent' };
            }
            // A DB problem must not fail the caller's business action either.
            this.logger.error(
                `Could not claim ${template} for ${userId}: ${(err as Error).message}`,
            );
            return { sent: false, error: (err as Error).message };
        }

        const result = await this.provider.sendTemplate(phone, template, params);

        try {
            await this.prisma.whatsAppMessage.update({
                where: { id: claimId },
                data: result.ok
                    ? {
                          status: WhatsAppStatus.SENT,
                          sentAt: new Date(),
                          providerId: result.messageId ?? null,
                      }
                    : { status: WhatsAppStatus.FAILED, error: result.error?.slice(0, 500) ?? null },
            });
        } catch (err) {
            // The message may well have gone out; only the bookkeeping failed.
            this.logger.error(
                `Could not record ${template} for ${userId}: ${(err as Error).message}`,
            );
        }

        if (!result.ok) {
            this.logger.error(`WhatsApp ${template} to ${phone} failed: ${result.error}`);
            return { sent: false, error: result.error };
        }
        return { sent: true };
    }

    /**
     * An admin-triggered send that deliberately bypasses the dedupe row.
     *
     * Exists for exactly one job: proving the WATI credentials and an approved
     * template work, against a real handset, without having to fake a
     * submission. It writes a log row with a unique key so the send is still
     * visible in the message log.
     */
    async probe(
        userId: string,
        phone: string,
        template: string,
        params: WatiParam[],
    ): Promise<WhatsAppOutcome> {
        return this.send({
            userId,
            phone,
            template,
            dedupeKey: `probe:${Date.now()}`,
            params,
        });
    }

    /** The most recent sends, newest first — the admin screen's message log. */
    async recent(limit = 50) {
        return this.prisma.whatsAppMessage.findMany({
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 200),
            select: {
                id: true,
                template: true,
                phone: true,
                status: true,
                providerId: true,
                error: true,
                createdAt: true,
                sentAt: true,
                user: { select: { firstName: true, lastName: true, rollNumber: true } },
            },
        });
    }
}
