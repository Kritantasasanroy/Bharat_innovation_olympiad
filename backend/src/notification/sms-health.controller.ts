import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { normalizePhone } from '../auth/phone.helpers';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationService } from './notification.service';

/**
 * SMS gateway diagnostics.
 *
 * This exists because of a beta failure that no amount of reading the code
 * could explain: voice OTPs arrived, SMS OTPs did not, and the send path
 * reported success for both. On 2Factor a send returns `Status: Success` as
 * soon as it is *accepted* — an unapproved DLT template or an exhausted SMS
 * balance (billed separately from voice) fails silently at the carrier, long
 * after this process has stopped looking.
 *
 * So: report the balances, let an admin fire a real send, and hand back the
 * gateway's session id so the carrier's own delivery report can be pulled.
 * Admin-only, and it never returns the OTP or the API key.
 */
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SmsHealthController {
    constructor(private notifications: NotificationService) {}

    /** Active providers plus remaining SMS and voice credits. */
    @Get('sms-health')
    async smsHealth() {
        return this.notifications.smsDiagnostics();
    }

    /**
     * Send a real OTP to a real handset and return only the tracking handle.
     *
     * The code is deliberately not in the response: an admin able to mint a
     * usable OTP for an arbitrary number could sign in as any student, since
     * the phone number is itself a login identifier.
     */
    @Get('sms-probe')
    async smsProbe(@Query('phone') phone?: string) {
        if (!phone?.trim()) {
            throw new BadRequestException('A phone number is required, e.g. ?phone=+919812345678');
        }
        const normalized = normalizePhone(phone);
        const result = await this.notifications.smsProbe(normalized);
        return {
            ...result,
            phone: normalized,
            note: result.sessionId
                ? 'Pass this sessionId to /admin/notifications/sms-delivery-report to see whether the carrier accepted it.'
                : 'This gateway does not report a session id, so delivery cannot be traced.',
        };
    }

    /** Carrier-level delivery status for a session id returned by `sms-probe`. */
    @Get('sms-delivery-report')
    async smsDeliveryReport(@Query('sessionId') sessionId?: string) {
        if (!sessionId?.trim()) {
            throw new BadRequestException('A sessionId from /admin/notifications/sms-probe is required.');
        }
        return { sessionId, report: await this.notifications.smsDeliveryReport(sessionId.trim()) };
    }
}
