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
import { SmsService } from './sms.service';
import {
    SMS_TEMPLATES,
    SmsTemplateKey,
    examRequirementsMessage,
    reminderMessage,
    scheduleMessage,
    submissionMessage,
    registrationMessage,
} from './sms-templates';

/**
 * Transactional-SMS diagnostics, the twin of `WhatsAppHealthController`.
 *
 * A `5068570-…` submission id from the gateway means **accepted**, not
 * delivered — DND numbers, a spent balance and template mismatches all fail
 * downstream where this process cannot see them. The three things that
 * diagnose a "nobody got the SMS" report: the account's credit balance, a real
 * send to a real handset, and the log of what was already sent. Admin-only,
 * and the password is never in a response.
 */
@Controller('admin/sms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SmsTransactionalController {
    constructor(private readonly sms: SmsService) {}

    /** Provider, kill-switch state, and the account's remaining SMS credits. */
    @Get('health')
    async health() {
        return this.sms.diagnostics();
    }

    /** Recent sends, newest first — what actually went out, and what failed. */
    @Get('messages')
    async messages(@Query('limit') limit?: string) {
        const n = Number(limit);
        return this.sms.recent(Number.isFinite(n) && n > 0 ? n : 50);
    }

    /**
     * Send one approved template to a real handset, with the approved sample
     * values, to prove the credentials and the DLT template work end to end.
     * Deliberately not free-text: only approved bodies can be sent.
     */
    @Post('probe')
    async probe(
        // The probe's log row is owned by the admin who fired it, not by a
        // student — it is a test send, and attributing it to a student would
        // put a message in their history that they never received.
        @CurrentUser('id') adminId: string,
        @Query('phone') phone?: string,
        @Query('template') template?: string,
    ) {
        if (!phone?.trim()) {
            throw new BadRequestException('A phone number is required, e.g. ?phone=+919812345678');
        }

        const key = (template?.trim() || 'registration') as SmsTemplateKey;
        if (!(key in SMS_TEMPLATES)) {
            throw new BadRequestException(
                `Unknown template "${template}". One of: ${Object.keys(SMS_TEMPLATES).join(', ')}.`,
            );
        }

        const normalized = normalizePhone(phone);
        // The approved samples, so a probe never invents a value a real send
        // would not produce. `sampleAt` is a fixed instant for reproducibility.
        const sampleAt = new Date('2026-09-28T04:00:00.000Z'); // 9:30 AM IST
        const message = {
            registration: () => registrationMessage({ rollNumber: 'BIO26-G6-00017' }),
            schedule: () => scheduleMessage({ startsAt: sampleAt }),
            requirements: () => examRequirementsMessage(),
            reminder: () => reminderMessage({ startsAt: sampleAt }),
            submission: () => submissionMessage({ submittedAt: sampleAt }),
        }[key]();

        const outcome = await this.sms.probe(adminId, normalized, key, message);
        return { phone: normalized, template: SMS_TEMPLATES[key].name, message, ...outcome };
    }
}
