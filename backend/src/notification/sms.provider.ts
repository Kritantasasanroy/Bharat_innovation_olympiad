import { Logger } from '@nestjs/common';

export interface SmsProvider {
    readonly name: string;
    /**
     * Deliver a one-time code.
     *
     * `code` is passed separately from any message body because Indian OTP
     * routes take it as a template variable, not as free-form text — the
     * wording itself belongs to the provider's DLT-registered template.
     */
    sendOtp(toE164: string, code: string): Promise<void>;

    /** Deliver the same one-time code by an automated voice call instead of SMS. */
    sendOtpVoice(toE164: string, code: string): Promise<void>;
}

/** Indian OTP routes address the subscriber number without the country code. */
export function toIndianLocal(toE164: string): string {
    const digits = toE164.replace(/\D/g, '');
    return digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
}

/** No credentials configured — log instead of failing the caller. */
export class ConsoleSmsProvider implements SmsProvider {
    readonly name = 'console';
    private readonly logger = new Logger('SmsProvider:console');

    async sendOtp(toE164: string, code: string): Promise<void> {
        this.logger.log(`[not sent — no provider configured] otp for ${toE164}: ${code}`);
    }

    async sendOtpVoice(toE164: string, code: string): Promise<void> {
        this.logger.log(`[not sent — no provider configured] voice otp for ${toE164}: ${code}`);
    }
}

/**
 * 2Factor (https://2factor.in) — OTP-specialised Indian gateway.
 *
 * Sends under 2Factor's own DLT-registered header, so it works without the
 * 2–4 week TRAI/DLT entity+template registration a self-registered sender ID
 * would need. Billed per *delivered* message.
 *
 * Endpoint: /API/V1/{apiKey}/SMS/{number}/{otp}/{template}
 * A 200 can still carry Status: "Error", so the body is checked too.
 */
export class TwoFactorSmsProvider implements SmsProvider {
    readonly name = '2factor';
    private readonly logger = new Logger('SmsProvider:2factor');

    constructor(
        private readonly apiKey: string,
        private readonly templateName: string,
    ) {}

    async sendOtp(toE164: string, code: string): Promise<void> {
        const number = toIndianLocal(toE164);
        // A fresh 2Factor account has no custom template yet, and passing a
        // template name that doesn't exist is rejected. "AUTOGEN"/blank means
        // "use 2Factor's own pre-approved default OTP template" — the
        // segment-less form `/SMS/{number}/{otp}`. A real named template is
        // only appended once the account actually has one.
        const base =
            `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/SMS/` +
            `${encodeURIComponent(number)}/${encodeURIComponent(code)}`;
        const useDefaultTemplate =
            !this.templateName || /^autogen$/i.test(this.templateName);
        const url = useDefaultTemplate
            ? base
            : `${base}/${encodeURIComponent(this.templateName)}`;

        const res = await fetch(url, { method: 'GET' });
        const body = await res.text().catch(() => '');

        if (!res.ok) {
            throw new Error(`2Factor responded ${res.status}: ${body.slice(0, 300)}`);
        }
        // Success looks like {"Status":"Success","Details":"<session id>"}.
        if (!/"Status"\s*:\s*"Success"/i.test(body)) {
            throw new Error(`2Factor rejected the send: ${body.slice(0, 300)}`);
        }
        this.logger.log(`OTP sent to ${toE164}`);
    }

    /**
     * Deliver the code as an automated phone call.
     * Endpoint: /API/V1/{apiKey}/VOICE/{number}/{otp} — reads the digits aloud.
     * Billed against the separate Voice-OTP balance, not the SMS one.
     */
    async sendOtpVoice(toE164: string, code: string): Promise<void> {
        const number = toIndianLocal(toE164);
        const url =
            `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/VOICE/` +
            `${encodeURIComponent(number)}/${encodeURIComponent(code)}`;

        const res = await fetch(url, { method: 'GET' });
        const body = await res.text().catch(() => '');

        if (!res.ok) {
            throw new Error(`2Factor (voice) responded ${res.status}: ${body.slice(0, 300)}`);
        }
        if (!/"Status"\s*:\s*"Success"/i.test(body)) {
            throw new Error(`2Factor rejected the voice call: ${body.slice(0, 300)}`);
        }
        this.logger.log(`Voice OTP call placed to ${toE164}`);
    }
}

/**
 * Fast2SMS (https://fast2sms.com) — alternative Indian gateway.
 *
 * Its `otp` route also sends under Fast2SMS's own registered header, so no
 * own-DLT registration is required. Kept as a swap-in second option so a
 * delivery problem with one gateway is a config change, not a code change.
 */
export class Fast2SmsProvider implements SmsProvider {
    readonly name = 'fast2sms';
    private readonly logger = new Logger('SmsProvider:fast2sms');

    constructor(private readonly apiKey: string) {}

    async sendOtp(toE164: string, code: string): Promise<void> {
        const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
                authorization: this.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                route: 'otp',
                variables_values: code,
                numbers: toIndianLocal(toE164),
            }),
        });
        const body = await res.text().catch(() => '');

        if (!res.ok) {
            throw new Error(`Fast2SMS responded ${res.status}: ${body.slice(0, 300)}`);
        }
        if (!/"return"\s*:\s*true/i.test(body)) {
            throw new Error(`Fast2SMS rejected the send: ${body.slice(0, 300)}`);
        }
        this.logger.log(`OTP sent to ${toE164}`);
    }

    async sendOtpVoice(_toE164: string, _code: string): Promise<void> {
        // Fast2SMS has no voice-call OTP product; callers fall back to SMS.
        throw new Error('Voice OTP is not supported by the Fast2SMS provider.');
    }
}
