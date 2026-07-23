import { Logger } from '@nestjs/common';

export interface WhatsAppProvider {
    readonly name: string;
    /**
     * Send a one-time code. `code` is passed separately from any body text
     * because Meta's authentication templates take it as a parameter, not as
     * free-form content.
     */
    sendOtp(toE164: string, code: string): Promise<void>;
}

/** No credentials configured — log instead of failing the caller. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
    readonly name = 'console';
    private readonly logger = new Logger('WhatsAppProvider:console');

    async sendOtp(toE164: string, code: string): Promise<void> {
        this.logger.log(`[not sent — no provider configured] otp for ${toE164}: ${code}`);
    }
}

/**
 * Meta WhatsApp Cloud API.
 *
 * Chosen over SMS because India's DLT regime blocks unregistered commercial
 * SMS (including OTP) at the carrier, while WhatsApp is not classified as
 * telecom SMS and so needs no DLT registration.
 *
 * Requires an approved template of category AUTHENTICATION. Meta requires the
 * code to appear both as a body parameter and as the URL-button parameter for
 * copy-code templates, hence it being sent twice below.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
    readonly name = 'meta-cloud-api';
    private readonly logger = new Logger('WhatsAppProvider:meta');

    constructor(
        private readonly phoneNumberId: string,
        private readonly accessToken: string,
        private readonly templateName: string,
        private readonly languageCode: string,
        private readonly apiVersion: string,
    ) {}

    async sendOtp(toE164: string, code: string): Promise<void> {
        // Meta expects the number without a leading '+'.
        const to = toE164.replace(/^\+/, '');
        const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: this.templateName,
                    language: { code: this.languageCode },
                    components: [
                        {
                            type: 'body',
                            parameters: [{ type: 'text', text: code }],
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [{ type: 'text', text: code }],
                        },
                    ],
                },
            }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`WhatsApp API responded ${res.status}: ${body.slice(0, 300)}`);
        }
        this.logger.log(`OTP sent to ${toE164}`);
    }
}
