import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    ConsoleTransactionalSmsProvider,
    SmsJustProvider,
    TransactionalSmsDiagnostics,
    TransactionalSmsProvider,
} from './sms-just.provider';
import {
    SMS_TEMPLATES,
    SmsTemplateKey,
    examRequirementsMessage,
    reminderMessage,
    scheduleMessage,
    submissionMessage,
    registrationMessage,
} from './sms-templates';

/** Why a send did not happen, when it did not happen for a reason worth naming. */
export type SmsSkipReason = 'no-phone' | 'disabled' | 'already-sent';

export interface SmsOutcome {
    sent: boolean;
    /** True when the message joined the 30s-spaced queue instead of sending inline. */
    queued?: boolean;
    skipped?: SmsSkipReason;
    error?: string;
}

/**
 * Transactional SMS for the five moments a student needs one — the SMS twin of
 * `WhatsAppService`. Same contract, same dedupe shapes, same never-throw rule;
 * the one structural difference is the 30-second serial send queue (see the
 * class comment below for why).
 */
@Injectable()
export class SmsService implements OnModuleInit {
    private readonly logger = new Logger(SmsService.name);
    private provider: TransactionalSmsProvider = new ConsoleTransactionalSmsProvider();
    /** Set from SMS_ENABLED — the kill switch for a live cohort. */
    private enabled = true;

    /** The serial drain every send joins; keeps the gap between gateway calls. */
    private chain: Promise<void> = Promise.resolve();
    private lastSendAt = 0;

    /**
     * Minimum spacing between two gateway HTTP calls. A backfill fan-out or a
     * registration burst aligns many sends at once; the DLT gateways rate-limit
     * and spam-filter bursts, so the queue drains one message every 30s.
     * An instance field, not a static: the specs shrink it to keep the suite fast.
     */
    private readonly minGapMs = Number(process.env.SMS_MIN_GAP_MS ?? 30_000);

    constructor(private readonly prisma: PrismaService) {}

    onModuleInit() {
        // All four are account-specific: the credentials without the registered
        // sender/entity pair can authenticate but never deliver — so all-or-nothing,
        // like WATI's endpoint+token pair.
        const username = process.env.SMSJUST_USERNAME?.trim();
        const password = process.env.SMSJUST_PASSWORD?.trim();
        const senderId = process.env.SMSJUST_SENDER_ID?.trim();
        const entityId = process.env.SMSJUST_ENTITY_ID?.trim();
        this.enabled = process.env.SMS_ENABLED?.trim().toLowerCase() !== 'false';

        if (username && password && senderId && entityId) {
            this.provider = new SmsJustProvider(
                process.env.SMSJUST_ENDPOINT?.trim() ||
                    'http://www.smsjust.com/sms/user/urlsms.php',
                username,
                password,
                senderId,
                entityId,
            );
            this.logger.log('Transactional SMS provider: smsjust');
        } else {
            this.logger.warn(
                'SMSJUST_USERNAME / SMSJUST_PASSWORD / SMSJUST_SENDER_ID / SMSJUST_ENTITY_ID not set — ' +
                    'transactional SMS will be logged, not delivered.',
            );
        }

        if (!this.enabled) {
            this.logger.warn('SMS_ENABLED=false — no transactional SMS will be sent.');
        }
    }

    /** True when a real gateway is configured and the kill switch is off. */
    get isLive(): boolean {
        return this.enabled && this.provider.name !== 'console';
    }

    async diagnostics(): Promise<TransactionalSmsDiagnostics & { enabled: boolean }> {
        const base: TransactionalSmsDiagnostics & { enabled: boolean } = {
            provider: this.provider.name,
            configured: this.provider.name !== 'console',
            enabled: this.enabled,
        };
        if (this.provider.name === 'smsjust') {
            const balance = await (this.provider as SmsJustProvider).balance();
            return { ...base, ...(balance !== undefined ? { balance } : {}) };
        }
        return base;
    }

    // ── The five student-facing messages ─────────────────────────────────────

    /** Registration confirmed — the roll number has just been issued. Once per user. */
    async sendRegistration(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        rollNumber: string;
    }): Promise<SmsOutcome> {
        return this.enqueue({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: 'registration',
            dedupeKey: `reg:${vars.userId}`,
            message: registrationMessage({ rollNumber: vars.rollNumber }),
        });
    }

    /** Seat confirmed — the student's date and time. Re-sent when the sitting moves. */
    async sendSchedule(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        firstName: string;
        bookingId: string;
        slotId: string;
        startsAt: Date;
    }): Promise<SmsOutcome> {
        return this.enqueue({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: 'schedule',
            dedupeKey: `${vars.bookingId}:${vars.slotId}`,
            message: scheduleMessage({ firstName: vars.firstName, startsAt: vars.startsAt }),
        });
    }

    /** The device/environment checklist. Once per student, right after registration. */
    async sendExamRequirements(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
    }): Promise<SmsOutcome> {
        return this.enqueue({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: 'requirements',
            dedupeKey: `req:${vars.userId}`,
            message: examRequirementsMessage(),
        });
    }

    /** The day-before reminder. Deduped on the booking *and* the exam's IST date. */
    async sendReminder(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        bookingId: string;
        startsAt: Date;
        /** `YYYY-MM-DD` in IST — supplied by the sweeper, which already computed it. */
        examDateKey: string;
    }): Promise<SmsOutcome> {
        return this.enqueue({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: 'reminder',
            dedupeKey: `${vars.bookingId}:${vars.examDateKey}`,
            message: reminderMessage({ startsAt: vars.startsAt }),
        });
    }

    /** Paper submitted — manual or auto. Deduped on the attempt. */
    async sendSubmission(vars: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        firstName: string;
        attemptId: string;
        submittedAt: Date;
    }): Promise<SmsOutcome> {
        return this.enqueue({
            userId: vars.userId,
            phone: vars.phone,
            phoneRaw: vars.phoneRaw,
            template: 'submission',
            dedupeKey: vars.attemptId,
            message: submissionMessage({ firstName: vars.firstName, submittedAt: vars.submittedAt }),
        });
    }

    /**
     * An admin-triggered send that deliberately bypasses the dedupe row.
     *
     * Exists for exactly one job: proving the gateway credentials and a DLT
     * template work, against a real handset, without faking a registration.
     * It writes a log row with a unique key so the send stays visible.
     */
    async probe(
        userId: string,
        phone: string,
        templateKey: SmsTemplateKey,
        message: string,
    ): Promise<SmsOutcome> {
        return this.enqueue({
            userId,
            phone,
            template: templateKey,
            dedupeKey: `probe:${Date.now()}`,
            message,
        });
    }

    /** The most recent sends, newest first — the admin screen's message log. */
    async recent(limit = 50) {
        return this.prisma.smsMessage.findMany({
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

    /**
     * Join the serial send queue. Returns immediately with `queued` — the
     * actual gateway call happens in the background, at least 30s after the
     * previous one. The claim-then-send runs inside the queue, so the unique
     * `(template, dedupeKey)` index arbitrates duplicates at send time, and a
     * process that dies mid-queue never leaves a "sent" lie behind.
     */
    private enqueue(input: {
        userId: string;
        phone: string | null | undefined;
        phoneRaw?: string | null | undefined;
        template: SmsTemplateKey;
        dedupeKey: string;
        message: string;
    }): Promise<SmsOutcome> {
        // Not an error: a phone number is optional on `User`. They still get
        // the email; `phoneRaw` (unverified, stored at registration) covers
        // students who typed a number but never completed OTP.
        const phone = input.phone?.trim() || input.phoneRaw?.trim();
        if (!phone) return Promise.resolve({ sent: false, skipped: 'no-phone' });

        if (!this.enabled) return Promise.resolve({ sent: false, skipped: 'disabled' });

        this.chain = this.chain
            .then(() => this.deliver({ ...input, phone }))
            .catch((err) =>
                this.logger.error(
                    `SMS queue job ${input.template}/${input.dedupeKey} failed: ${(err as Error).message}`,
                ),
            );
        return Promise.resolve({ sent: false, queued: true });
    }

    /** Claim → wait out the gap → send → record. Runs strictly one at a time. */
    private async deliver(input: {
        userId: string;
        phone: string;
        template: SmsTemplateKey;
        dedupeKey: string;
        message: string;
    }): Promise<void> {
        const { userId, phone, template, dedupeKey, message } = input;
        const { name, dltId } = SMS_TEMPLATES[template];

        let claimId: string;
        try {
            const claim = await this.prisma.smsMessage.create({
                data: { userId, template: name, dedupeKey, phone, status: 'PENDING' },
                select: { id: true },
            });
            claimId = claim.id;
        } catch (err) {
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002'
            ) {
                return;
            }
            // A DB problem must not fail the caller's business action either.
            this.logger.error(
                `Could not claim ${template} for ${userId}: ${(err as Error).message}`,
            );
            return;
        }

        const gap = this.lastSendAt + this.minGapMs - Date.now();
        if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));

        const result = await this.provider.sendTemplate(phone, dltId, message);
        this.lastSendAt = Date.now();

        try {
            await this.prisma.smsMessage.update({
                where: { id: claimId },
                data: result.ok
                    ? { status: 'SENT', sentAt: new Date(), providerId: result.scheduleId ?? null }
                    : { status: 'FAILED', error: result.error?.slice(0, 500) ?? null },
            });
        } catch (err) {
            // The message may well have gone out; only the bookkeeping failed.
            this.logger.error(
                `Could not record ${template} for ${userId}: ${(err as Error).message}`,
            );
        }

        if (!result.ok) {
            this.logger.error(`SMS ${template} to ${phone} failed: ${result.error}`);
        }
    }
}
