import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * What a gateway can tell us about itself, for the admin SMS-health screen.
 *
 * Everything here is optional: a provider that cannot report a balance simply
 * omits it. Never include the API key — this crosses an HTTP boundary.
 */
export interface SmsDiagnostics {
    provider: string;
    /** Remaining SMS credits, if the gateway exposes them. */
    smsBalance?: string;
    /** Remaining voice credits — billed separately from SMS on 2Factor. */
    voiceBalance?: string;
    /** Anything that stopped the probe from answering. */
    errors?: string[];
}

/** The outcome of one OTP send, including whatever the gateway can be traced by. */
export interface SmsSendResult {
    /** The code the student will receive. */
    code: string;
    /**
     * The gateway's own handle for this message (2Factor calls it a session id).
     * This is the only way to look a send up in the provider dashboard or ask
     * for a delivery report, so it is logged and surfaced to admin diagnostics.
     */
    sessionId?: string;
}

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

    /**
     * The same send, but reporting the gateway's tracking handle alongside the
     * code. `sendSmsOtp` stays as the narrow interface every caller already
     * uses; this is what the diagnostics path calls.
     */
    sendSmsOtpTraced?(toE164: string): Promise<SmsSendResult>;

    /** Read a caller-supplied code out over an automated voice call. */
    sendOtpVoice(toE164: string, code: string): Promise<void>;

    /** Balances and health, for the admin diagnostics endpoint. */
    diagnostics?(): Promise<SmsDiagnostics>;

    /** Ask the gateway whether a previous send actually reached the handset. */
    deliveryReport?(sessionId: string): Promise<string>;
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
 *
 * ── Why this class carries delivery instrumentation ──
 * `Status: "Success"` from 2Factor means **accepted for delivery**, not
 * delivered. An OTP template that is not DLT-approved, or an exhausted SMS
 * balance (voice bills against a *separate* balance, so working voice OTP
 * proves nothing), both fail silently at the carrier — long after this process
 * has returned success and moved on. That is exactly the beta failure: calls
 * arrived, SMS never did, and every log line said the send worked.
 *
 * So each send now records the session id and, unless disabled, asks 2Factor
 * for the carrier's delivery report a few seconds later and logs the verdict.
 * Nothing blocks on it — the student gets their code at the same speed — but a
 * systematically undelivered template shows up in the logs on the first send
 * instead of via user complaints.
 */
export class TwoFactorSmsProvider implements SmsProvider {
    readonly name = '2factor';
    private readonly logger = new Logger('SmsProvider:2factor');

    /** How long to wait before asking the carrier whether the SMS landed. */
    private static readonly DLR_DELAY_MS = 15_000;

    constructor(
        private readonly apiKey: string,
        private readonly templateName: string,
        /** Set false to stop the background delivery-report probe. */
        private readonly verifyDelivery: boolean = true,
    ) {}

    /**
     * Strips the API key out of anything on its way to a log line or an HTTP
     * response.
     *
     * The key is a path segment in every 2Factor URL, so a gateway error that
     * quotes the request — or any future code that logs a URL — would leak it.
     * The diagnostics endpoint hands raw gateway bodies to an admin browser,
     * which is exactly the boundary worth being paranoid at.
     */
    private redact(text: string): string {
        return this.apiKey ? text.split(this.apiKey).join('***') : text;
    }

    /** Which template name, if any, gets appended to the AUTOGEN2 URL. */
    get activeTemplate(): string | null {
        const useDefault = !this.templateName || /^autogen$/i.test(this.templateName);
        return useDefault ? null : this.templateName;
    }

    async sendSmsOtp(toE164: string): Promise<string> {
        return (await this.sendSmsOtpTraced(toE164)).code;
    }

    async sendSmsOtpTraced(toE164: string): Promise<SmsSendResult> {
        const number = toIndianLocal(toE164);
        // Use the approved named template when configured; else 2Factor's default.
        const template = this.activeTemplate;
        const base =
            `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/SMS/` +
            `${encodeURIComponent(number)}/AUTOGEN2`;
        const url = template ? `${base}/${encodeURIComponent(template)}` : base;

        const res = await fetch(url, { method: 'GET' });
        const body = await res.text().catch(() => '');
        if (!res.ok) {
            throw new Error(`2Factor responded ${res.status}: ${this.redact(body.slice(0, 300))}`);
        }

        let parsed: { Status?: string; Details?: string; OTP?: string } = {};
        try {
            parsed = JSON.parse(body);
        } catch {
            /* fall through to the validation below */
        }
        if (!/^success$/i.test(String(parsed.Status ?? '')) || !parsed.OTP) {
            throw new Error(`2Factor rejected the send: ${this.redact(body.slice(0, 300))}`);
        }

        // `Details` is 2Factor's session id — the only handle that can look this
        // message up in their dashboard or fetch a delivery report. A send that
        // returns Success but never arrives (unapproved DLT template, exhausted
        // SMS balance) is indistinguishable from a good one *here*, so the id
        // and the template in force are logged to make that diagnosable at all.
        const sessionId = parsed.Details ? String(parsed.Details) : undefined;
        this.logger.log(
            `OTP SMS accepted for ${toE164} · template=${template ?? 'account-default'} · session=${sessionId ?? 'n/a'}`,
        );

        if (this.verifyDelivery && sessionId) {
            this.probeDelivery(toE164, sessionId, template);
        }

        return { code: String(parsed.OTP), sessionId };
    }

    /**
     * Fire-and-forget carrier delivery check.
     *
     * Never awaited and never allowed to throw: this is observability, and a
     * failing probe must not turn a delivered OTP into a failed login. The
     * whole point is that it runs *after* the student already has their code.
     */
    private probeDelivery(toE164: string, sessionId: string, template: string | null): void {
        const timer = setTimeout(() => {
            void this.deliveryReport(sessionId)
                .then((report) => {
                    const delivered = /delivered/i.test(report);
                    const line =
                        `OTP SMS delivery report for ${toE164} · session=${sessionId} · ` +
                        `template=${template ?? 'account-default'} · ${report.replace(/\s+/g, ' ').trim()}`;
                    if (delivered) {
                        this.logger.log(line);
                    } else {
                        // The actionable case. 2Factor accepted the message and
                        // the carrier did not deliver it — almost always an
                        // unapproved DLT template or a spent SMS balance.
                        this.logger.error(
                            `${line} — NOT delivered. Check the DLT template name in ` +
                                `TWOFACTOR_OTP_TEMPLATE and the SMS balance via ` +
                                `GET /api/admin/notifications/sms-health.`,
                        );
                    }
                })
                .catch((err) =>
                    this.logger.warn(
                        `Could not fetch delivery report for session ${sessionId}: ${(err as Error).message}`,
                    ),
                );
        }, TwoFactorSmsProvider.DLR_DELAY_MS);

        // Do not hold the event loop open on a shutting-down process for this.
        timer.unref?.();
    }

    /**
     * Remaining credits on each product. SMS and voice bill against **separate**
     * balances, which is why a working voice OTP proves nothing about SMS — the
     * exact symptom that made this endpoint necessary.
     */
    async diagnostics(): Promise<SmsDiagnostics> {
        const errors: string[] = [];

        const balance = async (product: 'SMS' | 'VOICE'): Promise<string | undefined> => {
            try {
                const res = await fetch(
                    `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/BAL/${product}`,
                );
                const body = await res.text().catch(() => '');
                const parsed = JSON.parse(body) as { Status?: string; Details?: unknown };
                if (!/^success$/i.test(String(parsed.Status ?? ''))) {
                    errors.push(`${product} balance: ${this.redact(body.slice(0, 200))}`);
                    return undefined;
                }
                // 2Factor returns Details as either a bare string or [{ ... }].
                return Array.isArray(parsed.Details)
                    ? JSON.stringify(parsed.Details[0])
                    : String(parsed.Details);
            } catch (err) {
                errors.push(`${product} balance: ${this.redact((err as Error).message)}`);
                return undefined;
            }
        };

        const [smsBalance, voiceBalance] = await Promise.all([balance('SMS'), balance('VOICE')]);
        return {
            provider: this.name,
            smsBalance,
            voiceBalance,
            ...(errors.length ? { errors } : {}),
        };
    }

    /** Carrier-level delivery status for a previous send, by session id. */
    async deliveryReport(sessionId: string): Promise<string> {
        const res = await fetch(
            `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/ADDON_SERVICES/RPT/TSMS/` +
                `${encodeURIComponent(sessionId)}`,
        );
        const body = await res.text().catch(() => '');
        return this.redact(body.slice(0, 1000));
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
            throw new Error(`2Factor (voice) responded ${res.status}: ${this.redact(body.slice(0, 300))}`);
        }
        if (!/"Status"\s*:\s*"Success"/i.test(body)) {
            throw new Error(`2Factor rejected the voice call: ${this.redact(body.slice(0, 300))}`);
        }
        this.logger.log(`Voice OTP call placed to ${toE164}`);
    }
}

// A Fast2SmsProvider used to live here as a second gateway to switch to when
// 2Factor sends reported success but never arrived. Removed deliberately: the
// same 2Factor account places voice OTP calls that *do* arrive, which points at
// account verification rather than at the SMS API, so a second gateway added
// configuration surface and its own failure modes without addressing the cause.
// 2Factor is now the only gateway; the fix is KYC (docs/2FACTOR-KYC-SETUP.md).
