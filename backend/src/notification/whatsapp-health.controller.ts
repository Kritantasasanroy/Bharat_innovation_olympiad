import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { normalizePhone } from '../auth/phone.helpers';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WhatsAppReminderService } from './whatsapp-reminder.service';
import { WhatsAppService } from './whatsapp.service';
import {
    WHATSAPP_TEMPLATES,
    WhatsAppTemplateKey,
    reminderParams,
    resultParams,
    scheduleParams,
    submissionParams,
} from './whatsapp.templates';

/**
 * WhatsApp diagnostics, for the same reason the SMS ones exist.
 *
 * A WATI send that returns `result: true` is not proof of delivery — a number
 * that never opted in, or a template still in Meta review, fails downstream
 * where this process cannot see it. The three things that actually diagnose a
 * "nobody got the message" report are: which templates the account has approved
 * *right now*, a real send to a real handset, and the log of what was already
 * sent. Admin-only, and the access token is never in a response.
 */
@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class WhatsAppHealthController {
    constructor(
        private readonly whatsapp: WhatsAppService,
        private readonly reminders: WhatsAppReminderService,
    ) {}

    /** Provider, endpoint, kill-switch state, and the account's approved templates. */
    @Get('health')
    async health() {
        const diagnostics = await this.whatsapp.diagnostics();
        const required = Object.values(WHATSAPP_TEMPLATES);
        // The single most useful line on this screen: a template that was
        // renamed or deleted on the WATI side is invisible until a send fails.
        const missing = diagnostics.approvedTemplates
            ? required.filter((name) => !diagnostics.approvedTemplates!.includes(name))
            : undefined;
        return { ...diagnostics, requiredTemplates: required, missingTemplates: missing };
    }

    /** Recent sends, newest first — what actually went out, and what failed. */
    @Get('messages')
    async messages(@Query('limit') limit?: string) {
        const n = Number(limit);
        return this.whatsapp.recent(Number.isFinite(n) && n > 0 ? n : 50);
    }

    /**
     * Send one approved template to a real handset, with the approved sample
     * values, to prove the credentials and the template work end to end.
     *
     * Deliberately not free-text: WhatsApp has no free-text send for a
     * business-initiated message, and offering one here would only produce
     * confusing rejections.
     */
    @Post('probe')
    async probe(
        // The probe's log row is owned by the admin who fired it, not by a
        // student — it is a test send, and attributing it to a student would put
        // a message in their history that they never received.
        @CurrentUser('id') adminId: string,
        @Query('phone') phone?: string,
        @Query('template') template?: string,
    ) {
        if (!phone?.trim()) {
            throw new BadRequestException('A phone number is required, e.g. ?phone=+919812345678');
        }

        const key = (template?.trim() || 'submission') as WhatsAppTemplateKey;
        if (!(key in WHATSAPP_TEMPLATES)) {
            throw new BadRequestException(
                `Unknown template "${template}". One of: ${Object.keys(WHATSAPP_TEMPLATES).join(', ')}.`,
            );
        }

        const normalized = normalizePhone(phone);
        // The approved samples, so a probe never invents a value a real send
        // would not produce. `sampleAt` is a fixed instant for reproducibility.
        const sampleAt = new Date('2026-08-18T09:30:00.000Z'); // 3:00 PM IST
        const params = {
            submission: () => submissionParams({ firstName: 'Akash', submittedAt: sampleAt }),
            schedule: () => scheduleParams({ firstName: 'Rajesh', startsAt: sampleAt }),
            result: () => resultParams({ firstName: 'Akash', percentile: 68, rank: 1067 }),
            reminder: () => reminderParams({ firstName: 'Rajesh', startsAt: sampleAt }),
        }[key]();

        const outcome = await this.whatsapp.probe(
            adminId,
            normalized,
            WHATSAPP_TEMPLATES[key],
            params,
        );
        return { phone: normalized, template: WHATSAPP_TEMPLATES[key], params, ...outcome };
    }

    /**
     * Run the T-1 day reminder sweep now instead of waiting for the hourly tick.
     *
     * Safe to press repeatedly: the sweep dedupes per booking per exam date, so
     * a second run reports everything as skipped rather than re-messaging a
     * cohort.
     */
    @Post('run-reminders')
    async runReminders() {
        return this.reminders.sweep();
    }
}
