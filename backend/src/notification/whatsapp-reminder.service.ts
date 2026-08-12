import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

/**
 * The day-before exam reminder (`bio_reminder`).
 *
 * ## Why a sweeper and not a scheduled job per booking
 *
 * The approved body says "scheduled for **tomorrow**", so the message is only
 * true on one day and there is nothing to schedule at booking time — a student
 * who books three weeks out would need a timer surviving three weeks of
 * deploys. Instead this asks, on a loop, "whose exam is tomorrow and has not
 * been told?", which is stateless, restart-safe, and self-healing: a sweep
 * missed because the process was down is simply picked up by the next one.
 *
 * ## Why `setInterval` and not `@nestjs/schedule`
 *
 * The backend has no scheduler dependency and one recurring job does not earn
 * one. The interval is unref'd so it never holds a shutting-down process open.
 *
 * ## Tomorrow, in IST
 *
 * "Tomorrow" is a calendar day, not "24 hours from now" — a student sitting at
 * 9 AM and one sitting at 6 PM should both be reminded the previous day, not at
 * different times. The day boundary is IST because that is the timetable's zone;
 * on a UTC server the naive boundary is 5:30 AM IST, which would send some
 * students' reminders a day early and some a day late.
 *
 * ## What stops a duplicate
 *
 * Nothing here — {@link WhatsAppService.sendReminder} dedupes on
 * `(booking, exam IST date)`, so this may run as often as it likes, and a
 * student moved to a different slot is correctly reminded again.
 */
@Injectable()
export class WhatsAppReminderService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WhatsAppReminderService.name);
    private timer: NodeJS.Timeout | null = null;

    /**
     * Hourly. Frequent enough that a deploy or a late booking cannot cause a
     * whole day's reminders to be missed, and cheap enough to be irrelevant —
     * every sweep after the first finds nothing new because of the dedupe row.
     */
    private static readonly SWEEP_INTERVAL_MS = 60 * 60 * 1000;

    /** Let the app finish booting before the first sweep touches the database. */
    private static readonly FIRST_SWEEP_DELAY_MS = 60_000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly whatsapp: WhatsAppService,
    ) {}

    onModuleInit() {
        if (process.env.WHATSAPP_REMINDERS_ENABLED?.trim().toLowerCase() === 'false') {
            this.logger.warn('WHATSAPP_REMINDERS_ENABLED=false — the T-1 day sweeper is off.');
            return;
        }

        const first = setTimeout(() => {
            void this.sweep();
            this.timer = setInterval(
                () => void this.sweep(),
                WhatsAppReminderService.SWEEP_INTERVAL_MS,
            );
            this.timer.unref?.();
        }, WhatsAppReminderService.FIRST_SWEEP_DELAY_MS);
        first.unref?.();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /**
     * Message everyone whose confirmed slot starts tomorrow (IST).
     *
     * Returns a count so the admin endpoint can report what a manual run did.
     * Never throws: this runs unattended on a timer, and an unhandled rejection
     * from a background sweep would take the process down.
     */
    async sweep(): Promise<{ considered: number; sent: number; skipped: number; failed: number }> {
        const summary = { considered: 0, sent: 0, skipped: 0, failed: 0 };

        try {
            const { start, end, dateKey } = tomorrowInIst();

            const bookings = await this.prisma.booking.findMany({
                where: {
                    status: BookingStatus.CONFIRMED,
                    slot: { startsAt: { gte: start, lt: end } },
                },
                select: {
                    id: true,
                    user: { select: { id: true, firstName: true, phone: true, phoneRaw: true } },
                    slot: { select: { startsAt: true } },
                },
            });

            summary.considered = bookings.length;
            if (!bookings.length) return summary;

            this.logger.log(
                `T-1 reminder sweep: ${bookings.length} confirmed booking(s) for ${dateKey} IST.`,
            );

            for (const booking of bookings) {
                const outcome = await this.whatsapp.sendReminder({
                    userId: booking.user.id,
                    phone: booking.user.phone,
                    phoneRaw: booking.user.phoneRaw,
                    firstName: booking.user.firstName,
                    bookingId: booking.id,
                    startsAt: booking.slot.startsAt,
                    examDateKey: dateKey,
                });
                if (outcome.sent) summary.sent++;
                else if (outcome.error) summary.failed++;
                else summary.skipped++;
            }

            if (summary.sent || summary.failed) {
                this.logger.log(
                    `T-1 reminder sweep for ${dateKey}: ${summary.sent} sent, ` +
                        `${summary.skipped} skipped, ${summary.failed} failed.`,
                );
            }
        } catch (err) {
            this.logger.error(`T-1 reminder sweep failed: ${(err as Error).message}`);
        }

        return summary;
    }
}

/**
 * The UTC instants bounding tomorrow's IST calendar day, plus its `YYYY-MM-DD`.
 *
 * IST is UTC+5:30 with no daylight saving — it has never observed it — so the
 * offset is a constant rather than something to look up per date. That is what
 * makes this arithmetic instead of a timezone library.
 */
export function tomorrowInIst(now: Date = new Date()): {
    start: Date;
    end: Date;
    dateKey: string;
} {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Shift into IST, floor to the day, step forward one day, shift back.
    const istNow = now.getTime() + IST_OFFSET_MS;
    const istTomorrowMidnight = Math.floor(istNow / DAY_MS) * DAY_MS + DAY_MS;

    const start = new Date(istTomorrowMidnight - IST_OFFSET_MS);
    const end = new Date(start.getTime() + DAY_MS);
    // Formatted from the *IST* instant, so it is tomorrow's Indian date.
    const dateKey = new Date(istTomorrowMidnight).toISOString().slice(0, 10);

    return { start, end, dateKey };
}
