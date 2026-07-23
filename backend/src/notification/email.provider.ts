import { Logger } from '@nestjs/common';

export interface EmailMessage {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export interface EmailProvider {
    readonly name: string;
    send(message: EmailMessage): Promise<void>;
}

/**
 * Used whenever no provider is configured — local dev, CI, and any deploy that
 * hasn't had `RESEND_API_KEY` set yet.
 *
 * Logging instead of throwing is deliberate: a missing email key must never
 * break registration or payment confirmation, which are the flows that trigger
 * these mails.
 */
export class ConsoleEmailProvider implements EmailProvider {
    readonly name = 'console';
    private readonly logger = new Logger('EmailProvider:console');

    async send(message: EmailMessage): Promise<void> {
        this.logger.log(`[not sent — no provider configured] to=${message.to} subject="${message.subject}"`);
    }
}

/**
 * Resend (https://resend.com) over its REST API.
 *
 * Called with `fetch` rather than the `resend` SDK so this adds no dependency
 * to the backend — the API is a single POST.
 */
export class ResendEmailProvider implements EmailProvider {
    readonly name = 'resend';
    private readonly logger = new Logger('EmailProvider:resend');

    constructor(
        private readonly apiKey: string,
        private readonly from: string,
    ) {}

    async send(message: EmailMessage): Promise<void> {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: this.from,
                to: [message.to],
                subject: message.subject,
                html: message.html,
                ...(message.text ? { text: message.text } : {}),
            }),
        });

        if (!res.ok) {
            // Surfaced to NotificationService, which decides whether the caller
            // should care. The body carries Resend's reason (unverified domain,
            // bad address, rate limit), so it is worth keeping.
            const body = await res.text().catch(() => '');
            throw new Error(`Resend responded ${res.status}: ${body.slice(0, 300)}`);
        }
    }
}
