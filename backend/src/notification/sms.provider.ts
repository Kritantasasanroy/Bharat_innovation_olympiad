import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SmsProvider {
    readonly name: string;
    /**
     * Send an OTP by SMS and return the code that was delivered.
     *
     * The code is *returned* rather than passed in because 2Factor only actually
     * sends when it generates the code itself (AUTOGEN). A custom code silently
     * no-ops on accounts that use their own DLT sender — it returns "Success" but
     * is never queued, charged, or logged. The caller hashes and verifies the
     * returned code, so all OTP verification stays server-side.
     */
    sendSmsOtp(toE164: string): Promise<string>;

    /** Read a caller-supplied code out over an automated voice call. */
    sendOtpVoice(toE164: string, code: string): Promise<void>;
}

/** A 6-digit code, for providers that let us supply our own (console, Fast2SMS). */
function genOtp(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
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

    async sendSmsOtp(toE164: string): Promise<string> {
        const code = genOtp();
        this.logger.log(`[not sent — no provider configured] sms otp for ${toE164}: ${code}`);
        return code;
    }

    async sendOtpVoice(toE164: string, code: string): Promise<void> {
        this.logger.log(`[not sent — no provider configured] voice otp for ${toE164}: ${code}`);
    }
}

/**
 * 2Factor (https://2factor.in) — OTP-specialised Indian gateway.
 *
 * SMS OTP is sent via **AUTOGEN2**: 2Factor generates the code, delivers it under
 * the account's DLT template, and returns it in the response. This is deliberate.
 * Once an account registers its own DLT sender, *custom*-value OTP sends stop
 * working — they return "Success" but are never queued or charged — whereas
 * AUTOGEN sends deliver normally. We adopt 2Factor's code and verify it
 * ourselves, so nothing else about the OTP flow changes. Voice OTP still takes a
 * caller-supplied code (custom-value voice works fine).
 */
export class TwoFactorSmsProvider implements SmsProvider {
    readonly name = '2factor';
    private readonly logger = new Logger('SmsProvider:2factor');

    constructor(
        private readonly apiKey: string,
        private readonly templateName: string,
    ) {}

    async sendSmsOtp(toE164: string): Promise<string> {
        const number = toIndianLocal(toE164);
        // Use the approved named template when configured; else 2Factor's default.
        const useDefaultTemplate = !this.templateName || /^autogen$/i.test(this.templateName);
        const base =
            `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/SMS/` +
            `${encodeURIComponent(number)}/AUTOGEN2`;
        const url = useDefaultTemplate ? base : `${base}/${encodeURIComponent(this.templateName)}`;

        const res = await fetch(url, { method: 'GET' });
        const body = await res.text().catch(() => '');
        if (!res.ok) {
            throw new Error(`2Factor responded ${res.status}: ${body.slice(0, 300)}`);
        }

        let parsed: { Status?: string; OTP?: string } = {};
        try {
            parsed = JSON.parse(body);
        } catch {
            /* fall through to the validation below */
        }
        if (!/^success$/i.test(String(parsed.Status ?? '')) || !parsed.OTP) {
            throw new Error(`2Factor rejected the send: ${body.slice(0, 300)}`);
        }
        this.logger.log(`OTP SMS sent to ${toE164}`);
        return String(parsed.OTP);
    }

    /**
     * Deliver a caller-supplied code as an automated phone call.
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
 * Fast2SMS (https://fast2sms.com) — alternative Indian gateway. Its `otp` route
 * accepts a caller-supplied code, so we generate it, send it, and return it.
 */
export class Fast2SmsProvider implements SmsProvider {
    readonly name = 'fast2sms';
    private readonly logger = new Logger('SmsProvider:fast2sms');

    constructor(private readonly apiKey: string) {}

    async sendSmsOtp(toE164: string): Promise<string> {
        const code = genOtp();
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
        this.logger.log(`OTP SMS sent to ${toE164}`);
        return code;
    }

    async sendOtpVoice(_toE164: string, _code: string): Promise<void> {
        // Fast2SMS has no voice-call OTP product; callers fall back to SMS.
        throw new Error('Voice OTP is not supported by the Fast2SMS provider.');
    }
}
