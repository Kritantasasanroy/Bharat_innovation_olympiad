import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    ConsoleEmailProvider,
    EmailProvider,
    ResendEmailProvider,
} from './email.provider';
import {
    RenderedEmail,
    accessPassActivatedEmail,
    adminBroadcastEmail,
    examSubmittedEmail,
    welcomeEmail,
} from './templates';
import {
    ConsoleSmsProvider,
    Fast2SmsProvider,
    SmsProvider,
    TwoFactorSmsProvider,
    toIndianLocal,
} from './sms.provider';

@Injectable()
export class NotificationService implements OnModuleInit {
    private readonly logger = new Logger(NotificationService.name);
    private email: EmailProvider = new ConsoleEmailProvider();
    private sms: SmsProvider = new ConsoleSmsProvider();

    onModuleInit() {
        const apiKey = process.env.RESEND_API_KEY?.trim();
        // Resend requires the sender domain to be verified; the shared
        // onboarding address works untouched for first-run testing.
        const from = process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev';

        if (apiKey) {
            this.email = new ResendEmailProvider(apiKey, from);
            this.logger.log(`Email provider: resend (from ${from})`);
        } else {
            this.logger.warn(
                'RESEND_API_KEY not set — emails will be logged, not delivered.',
            );
        }

        // Both gateways send under their own DLT-registered header, so OTP
        // delivery to Indian numbers works without the 2–4 week TRAI/DLT
        // registration a self-registered sender ID would require.
        const twoFactorKey = process.env.TWOFACTOR_API_KEY?.trim();
        const fast2smsKey = process.env.FAST2SMS_API_KEY?.trim();

        if (twoFactorKey) {
            this.sms = new TwoFactorSmsProvider(
                twoFactorKey,
                process.env.TWOFACTOR_OTP_TEMPLATE?.trim() || 'AUTOGEN',
            );
            this.logger.log('SMS provider: 2factor');
        } else if (fast2smsKey) {
            this.sms = new Fast2SmsProvider(fast2smsKey);
            this.logger.log('SMS provider: fast2sms');
        } else {
            this.logger.warn(
                'TWOFACTOR_API_KEY / FAST2SMS_API_KEY not set — OTPs will be logged, not delivered.',
            );
        }
    }

    /**
     * Deliver a login OTP by SMS.
     *
     * Unlike the transactional mails above, failures here DO propagate: the
     * student is waiting on this code, and silently swallowing the error would
     * leave them staring at a code-entry box that can never be satisfied.
     */
    /**
     * Send an OTP SMS and return the code that was delivered.
     *
     * 2Factor mints the code (custom-value SMS no-ops on a DLT-sender account),
     * so the caller adopts and verifies the returned code.
     */
    async sendOtpSms(toE164: string): Promise<string> {
        return this.sms.sendSmsOtp(toE164);
    }

    /** Read a caller-supplied code out as an automated voice call. Failures propagate. */
    async sendOtpVoice(toE164: string, code: string): Promise<void> {
        await this.sms.sendOtpVoice(toE164, code);
    }

    private get appUrl(): string {
        return process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    }

    /**
     * Send and swallow failures.
     *
     * Every caller is a business action that already succeeded — the account
     * exists, the money is taken. Rethrowing here would fail the request and
     * roll the user's experience back over a mail problem, so failures are
     * logged for follow-up instead.
     */
    private async deliver(to: string | null | undefined, mail: RenderedEmail): Promise<void> {
        if (!to) return;
        try {
            await this.email.send({ to, subject: mail.subject, html: mail.html, text: mail.text });
            this.logger.log(`Sent "${mail.subject}" to ${to}`);
        } catch (err) {
            this.logger.error(
                `Failed to send "${mail.subject}" to ${to}: ${(err as Error).message}`,
            );
        }
    }

    async sendWelcome(to: string, firstName: string): Promise<void> {
        await this.deliver(to, welcomeEmail({ firstName, appUrl: this.appUrl }));
    }

    async sendAccessPassActivated(to: string, firstName: string, amountPaise: number): Promise<void> {
        await this.deliver(
            to,
            accessPassActivatedEmail({ firstName, amountPaise, appUrl: this.appUrl }),
        );
    }

    async sendExamSubmitted(to: string, firstName: string, examTitle: string): Promise<void> {
        await this.deliver(to, examSubmittedEmail({ firstName, examTitle, appUrl: this.appUrl }));
    }

    /**
     * Deliver an admin-composed message to one recipient.
     *
     * Unlike the transactional mails above, the caller (an admin broadcast) needs
     * a per-recipient success/failure count, so this returns a boolean instead of
     * swallowing to void.
     */
    async sendAdminBroadcast(to: string, subject: string, message: string): Promise<boolean> {
        const mail = adminBroadcastEmail({ subject, message, appUrl: this.appUrl });
        try {
            await this.email.send({ to, subject: mail.subject, html: mail.html, text: mail.text });
            return true;
        } catch (err) {
            this.logger.error(`Admin mail to ${to} failed: ${(err as Error).message}`);
            return false;
        }
    }

    /**
     * Whether admin free-text SMS can be sent at all.
     *
     * Free-text (non-OTP) SMS to Indian numbers is a DLT-regulated route: it needs
     * the account's own registered sender id AND an approved template. The OTP
     * template can't carry arbitrary text. If either env var is missing there is
     * nothing to send through, so callers should skip the blast and tell the admin
     * exactly what to configure instead of firing doomed requests.
     */
    isAdminSmsConfigured(): boolean {
        return Boolean(
            process.env.TWOFACTOR_API_KEY?.trim() &&
                process.env.TWOFACTOR_SENDER_ID?.trim() &&
                process.env.TWOFACTOR_SMS_TEMPLATE?.trim(),
        );
    }

    /**
     * Send an admin-composed SMS to one number via 2Factor's transactional route.
     *
     * The admin's typed message is dropped verbatim into the template's single
     * variable, so a catch-all `{#var#}` template sends whatever was written. On
     * failure it returns the reason (not just `false`) so the caller can show the
     * admin *why* a send failed rather than a bare count.
     */
    async sendAdminSms(
        toE164: string,
        message: string,
    ): Promise<{ ok: boolean; error?: string }> {
        const apiKey = process.env.TWOFACTOR_API_KEY?.trim();
        const sender = process.env.TWOFACTOR_SENDER_ID?.trim();
        const template = process.env.TWOFACTOR_SMS_TEMPLATE?.trim();

        if (!apiKey || !sender || !template) {
            const reason =
                'SMS sender ID / template not configured (TWOFACTOR_SENDER_ID, TWOFACTOR_SMS_TEMPLATE).';
            this.logger.warn(`SMS to ${toE164} not sent — ${reason}`);
            return { ok: false, error: reason };
        }

        const number = toIndianLocal(toE164);
        const url =
            `https://2factor.in/API/R1/?module=TRANS_SMS&apikey=${encodeURIComponent(apiKey)}` +
            `&to=${encodeURIComponent(number)}&from=${encodeURIComponent(sender)}` +
            `&templatename=${encodeURIComponent(template)}&var1=${encodeURIComponent(message)}`;

        try {
            const res = await fetch(url, { method: 'GET' });
            const body = await res.text().catch(() => '');
            // A 200 can still carry Status:"Error" (bad template, DLT mismatch…).
            if (!res.ok || /"Status"\s*:\s*"Error"/i.test(body)) {
                const reason = `2Factor ${res.status}: ${body.slice(0, 200)}`;
                this.logger.error(`Admin SMS to ${toE164} failed: ${reason}`);
                return { ok: false, error: reason };
            }
            return { ok: true };
        } catch (err) {
            const reason = (err as Error).message;
            this.logger.error(`Admin SMS to ${toE164} failed: ${reason}`);
            return { ok: false, error: reason };
        }
    }
}
