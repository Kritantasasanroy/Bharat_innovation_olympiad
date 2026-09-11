import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
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

/**
 * Amazon SES (SESv2), used on the AWS environments.
 *
 * No credentials are configured here on purpose. The SDK resolves the EC2
 * instance profile, which carries a `bio-dev-ses-send` policy scoped to the two
 * verified identities and to a `noreply@` From address — so there is no SMTP
 * username or password to put in Parameter Store, rotate, or leak in a log.
 * That is also why this uses the SES API rather than SES's SMTP interface,
 * which would require a static credential pair.
 *
 * `from` must be an address on a **verified** identity. SES rejects anything
 * else outright, and while the account is in the sandbox it additionally
 * rejects any *recipient* that is not itself verified — a sandbox rejection
 * reads like a permissions error but is neither, so the message below keeps
 * SES's own reason.
 */
export class SesEmailProvider implements EmailProvider {
    readonly name = 'ses';
    private readonly logger = new Logger('EmailProvider:ses');
    private readonly client: SESv2Client;

    constructor(
        private readonly from: string,
        region: string,
        private readonly configurationSetName?: string,
    ) {
        this.client = new SESv2Client({ region });
    }

    async send(message: EmailMessage): Promise<void> {
        try {
            await this.client.send(
                new SendEmailCommand({
                    FromEmailAddress: this.from,
                    Destination: { ToAddresses: [message.to] },
                    ...(this.configurationSetName
                        ? { ConfigurationSetName: this.configurationSetName }
                        : {}),
                    Content: {
                        Simple: {
                            Subject: { Data: message.subject, Charset: 'UTF-8' },
                            Body: {
                                Html: { Data: message.html, Charset: 'UTF-8' },
                                ...(message.text
                                    ? { Text: { Data: message.text, Charset: 'UTF-8' } }
                                    : {}),
                            },
                        },
                    },
                }),
            );
        } catch (error) {
            const e = error as { name?: string; message?: string };
            throw new Error(`SES rejected the send (${e.name ?? 'error'}): ${e.message ?? ''}`.slice(0, 300));
        }
    }
}
