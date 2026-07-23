import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    ConsoleEmailProvider,
    EmailProvider,
    ResendEmailProvider,
} from './email.provider';
import {
    RenderedEmail,
    accessPassActivatedEmail,
    examSubmittedEmail,
    welcomeEmail,
} from './templates';
import {
    ConsoleWhatsAppProvider,
    MetaWhatsAppProvider,
    WhatsAppProvider,
} from './whatsapp.provider';

@Injectable()
export class NotificationService implements OnModuleInit {
    private readonly logger = new Logger(NotificationService.name);
    private email: EmailProvider = new ConsoleEmailProvider();
    private whatsapp: WhatsAppProvider = new ConsoleWhatsAppProvider();

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

        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
        if (phoneNumberId && accessToken) {
            this.whatsapp = new MetaWhatsAppProvider(
                phoneNumberId,
                accessToken,
                process.env.WHATSAPP_OTP_TEMPLATE?.trim() || 'otp_verification',
                process.env.WHATSAPP_OTP_LANGUAGE?.trim() || 'en',
                process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0',
            );
            this.logger.log('WhatsApp provider: meta-cloud-api');
        } else {
            this.logger.warn(
                'WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN not set — OTPs will be logged, not delivered.',
            );
        }
    }

    /**
     * Deliver a login OTP over WhatsApp.
     *
     * Unlike the transactional mails above, failures here DO propagate: the
     * student is waiting on this code, and silently swallowing the error would
     * leave them staring at a code-entry box that can never be satisfied.
     */
    async sendOtpViaWhatsApp(toE164: string, code: string): Promise<void> {
        await this.whatsapp.sendOtp(toE164, code);
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
}
