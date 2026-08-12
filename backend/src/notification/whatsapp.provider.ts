import { Logger } from '@nestjs/common';

/**
 * WhatsApp delivery through WATI (https://wati.io), the account's BSP.
 *
 * ## Why every message is a template
 *
 * WhatsApp only allows a business to open a conversation with a pre-approved
 * **template**, reviewed by Meta and frozen once approved. Free text is possible
 * only inside a 24-hour window the *student* opened by messaging us first, which
 * never happens here — every message this app sends is unprompted. So there is
 * no "send a WhatsApp message" primitive in this file at all, only "send
 * template X with these variables", and the variables are the sole thing that
 * varies. Changing a single character of an approved body means a new Meta
 * review, so {@link WHATSAPP_TEMPLATES} mirrors the approved bodies verbatim and
 * this provider never composes prose.
 */

/** One positional variable of an approved template — WATI names them "1", "2", … */
export interface WatiParam {
    name: string;
    value: string;
}

/** What a send tells the caller. Never throws to the caller; `ok` carries the verdict. */
export interface WhatsAppSendResult {
    ok: boolean;
    /** WATI's own id for the message, when it gave one — the handle for its dashboard. */
    messageId?: string;
    /** Why it failed, already redacted, short enough for a log line or an admin screen. */
    error?: string;
}

/** Health for the admin diagnostics screen. Never includes the token. */
export interface WhatsAppDiagnostics {
    provider: string;
    /** Whether credentials are present at all. */
    configured: boolean;
    /** The tenant endpoint in force, token stripped. */
    endpoint?: string;
    /** Approved template names the account can actually send, when reachable. */
    approvedTemplates?: string[];
    errors?: string[];
}

export interface WhatsAppProvider {
    readonly name: string;
    sendTemplate(
        toE164: string,
        templateName: string,
        params: WatiParam[],
    ): Promise<WhatsAppSendResult>;
    diagnostics(): Promise<WhatsAppDiagnostics>;
}

/**
 * WATI addresses a handset by country code + subscriber number, no `+`.
 *
 * Everything upstream stores E.164 (`+919812345678`) because that is what the
 * login identifier is normalised to, so this is the one place the shapes differ.
 */
export function toWatiNumber(toE164: string): string {
    return (toE164 ?? '').replace(/\D/g, '');
}

/** No credentials configured — log the send instead of silently doing nothing. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
    readonly name = 'console';
    private readonly logger = new Logger('WhatsApp:console');

    async sendTemplate(
        toE164: string,
        templateName: string,
        params: WatiParam[],
    ): Promise<WhatsAppSendResult> {
        const vars = params.map((p) => `${p.name}=${p.value}`).join(' · ');
        this.logger.log(
            `[not sent — no provider configured] ${templateName} → ${toE164} · ${vars}`,
        );
        return { ok: true };
    }

    async diagnostics(): Promise<WhatsAppDiagnostics> {
        return { provider: this.name, configured: false };
    }
}

/**
 * The live WATI tenant.
 *
 * ## The response shape, and why `result` is checked rather than the status code
 *
 * `POST /api/v1/sendTemplateMessage` answers **200 with `{"result": false,
 * "info": "..."}`** for most real failures — an un-opted-in number, a template
 * name that does not exist on the account, a variable count that does not match
 * the approved body. Trusting `res.ok` alone would log every one of those as a
 * successful send, which is precisely the failure mode the SMS gateway taught
 * this codebase to distrust (see `sms.provider.ts`). So both are checked.
 *
 * ## What "sent" does and does not mean
 *
 * A `result: true` means WATI queued the message for Meta. It is not proof the
 * handset received it: a number that never opted in, or one with no WhatsApp
 * account, fails downstream. WATI reports that only via its webhook, which this
 * app does not receive, so {@link WhatsAppSendResult.messageId} is recorded to
 * make a send traceable in the WATI dashboard when someone says "I got nothing".
 */
export class WatiWhatsAppProvider implements WhatsAppProvider {
    readonly name = 'wati';
    private readonly logger = new Logger('WhatsApp:wati');

    /** WATI rejects a slow request long before this; the timeout is for a hung socket. */
    private static readonly TIMEOUT_MS = 15_000;

    constructor(
        /** Tenant endpoint, e.g. `https://live-mt-server.wati.io/10175272`. No trailing slash. */
        private readonly endpoint: string,
        /** The tenant access token, with or without a leading `Bearer `. */
        private readonly token: string,
    ) {
        this.endpoint = endpoint.replace(/\/+$/, '');
    }

    /**
     * Keep the bearer token out of anything on its way to a log line or an admin
     * browser. WATI echoes the request in some error bodies, and the diagnostics
     * endpoint hands raw gateway text to an admin screen.
     */
    private redact(text: string): string {
        const bare = this.token.replace(/^Bearer\s+/i, '');
        return bare ? text.split(bare).join('***') : text;
    }

    private get authHeader(): string {
        return /^Bearer\s/i.test(this.token) ? this.token : `Bearer ${this.token}`;
    }

    async sendTemplate(
        toE164: string,
        templateName: string,
        params: WatiParam[],
    ): Promise<WhatsAppSendResult> {
        const number = toWatiNumber(toE164);
        if (!number) return { ok: false, error: 'No phone number' };

        const url =
            `${this.endpoint}/api/v1/sendTemplateMessage` +
            `?whatsappNumber=${encodeURIComponent(number)}`;

        // `broadcast_name` is WATI's grouping label in its own dashboard — it has
        // no effect on what the student sees. Naming it after the template makes
        // "how many submission confirmations went out today" answerable there.
        const body = {
            template_name: templateName,
            broadcast_name: `${templateName}_${new Date().toISOString().slice(0, 10)}`,
            parameters: params,
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: this.authHeader,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(WatiWhatsAppProvider.TIMEOUT_MS),
            });
            const text = await res.text().catch(() => '');

            if (!res.ok) {
                return { ok: false, error: `WATI ${res.status}: ${this.redact(text.slice(0, 300))}` };
            }

            let parsed: {
                result?: boolean | string;
                info?: string;
                message?: unknown;
                validWhatsAppNumber?: boolean;
            } = {};
            try {
                parsed = JSON.parse(text);
            } catch {
                return { ok: false, error: `WATI returned non-JSON: ${this.redact(text.slice(0, 200))}` };
            }

            // `result` comes back as a boolean here and as the string "success"
            // on the read endpoints; accept either rather than depending on which.
            const accepted =
                parsed.result === true || String(parsed.result).toLowerCase() === 'success';
            if (!accepted) {
                const info = parsed.info ? String(parsed.info) : this.redact(text.slice(0, 300));
                return { ok: false, error: `WATI rejected ${templateName}: ${info}` };
            }

            const messageId = WatiWhatsAppProvider.messageIdOf(parsed.message);
            this.logger.log(
                `${templateName} accepted for ${toE164} · id=${messageId ?? 'n/a'}`,
            );
            return { ok: true, messageId };
        } catch (err) {
            return { ok: false, error: this.redact((err as Error).message) };
        }
    }

    /** WATI nests its id under `message`, whose shape varies by endpoint version. */
    private static messageIdOf(message: unknown): string | undefined {
        if (!message || typeof message !== 'object') return undefined;
        const id = (message as { id?: unknown; whatsappMessageId?: unknown }).id
            ?? (message as { whatsappMessageId?: unknown }).whatsappMessageId;
        return id == null ? undefined : String(id);
    }

    /**
     * Reachability plus the account's approved template names.
     *
     * The template list is the useful half: the single most likely cause of "the
     * message never went out" is a template that was renamed, deleted or is still
     * in review on the WATI side, which is invisible from inside this process and
     * obvious the moment the list is in front of someone.
     */
    async diagnostics(): Promise<WhatsAppDiagnostics> {
        const base: WhatsAppDiagnostics = {
            provider: this.name,
            configured: true,
            endpoint: this.endpoint,
        };

        try {
            const res = await fetch(
                `${this.endpoint}/api/v1/getMessageTemplates?pageSize=100&pageNumber=1`,
                {
                    headers: { Authorization: this.authHeader },
                    signal: AbortSignal.timeout(WatiWhatsAppProvider.TIMEOUT_MS),
                },
            );
            const text = await res.text().catch(() => '');
            if (!res.ok) {
                return { ...base, errors: [`templates: WATI ${res.status}: ${this.redact(text.slice(0, 200))}`] };
            }
            const parsed = JSON.parse(text) as {
                messageTemplates?: { elementName?: string; status?: string }[];
            };
            const approvedTemplates = (parsed.messageTemplates ?? [])
                .filter((t) => String(t.status).toUpperCase() === 'APPROVED')
                .map((t) => String(t.elementName));
            return { ...base, approvedTemplates };
        } catch (err) {
            return { ...base, errors: [`templates: ${this.redact((err as Error).message)}`] };
        }
    }
}
