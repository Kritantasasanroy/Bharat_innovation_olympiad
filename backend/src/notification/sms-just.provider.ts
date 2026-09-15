import { Logger } from '@nestjs/common';

/**
 * Transactional SMS delivery through SMS Just (Universal Web Technologies,
 * https://smsjust.com) — the account's DLT-enabled bulk-SMS gateway.
 *
 * ## Why every message is a registered template
 *
 * TRAI's DLT mandate: a business may only SMS Indian subscribers from a
 * pre-registered template with a registered sender id and entity id. The
 * gateway matches the submitted text against the template registered under
 * `templateid`, so — exactly like the WhatsApp provider — this class never
 * composes prose. It sends one prebuilt message body per DLT template id, and
 * `sms-templates.ts` is the only place those bodies exist.
 *
 * ## The API
 *
 * A single GET (`urlsms.php`) with the credentials, sender id, DLT entity id
 * and template id as query parameters — see `API PARAMETERS.docx`. A
 * successful submission answers with a schedule id shaped
 * `<number>-<YYYY_MM_DD>`; every failure answers a short text — an `ES…` code
 * ("ES1001 Authentication Failed"), "Message is blank", "You have Exceeded
 * your SMS Limit", and so on. The status code is 200 in all of these cases,
 * so — the lesson `TwoFactorSmsProvider` already learned — the body, not the
 * HTTP status, is the verdict.
 */

/** What one send tells the caller. Never throws to the caller. */
export interface TransactionalSmsResult {
    ok: boolean;
    /** The gateway's submission id (`<id>-<date>`), for its DLR portal. */
    scheduleId?: string;
    /** Why it failed, already redacted, short enough for a log line. */
    error?: string;
}

export interface TransactionalSmsDiagnostics {
    provider: string;
    /** Whether credentials are present at all. */
    configured: boolean;
    /** Remaining SMS credits, when the gateway answers. */
    balance?: string;
    errors?: string[];
}

export interface TransactionalSmsProvider {
    readonly name: string;
    sendTemplate(
        toE164: string,
        dltTemplateId: string,
        message: string,
    ): Promise<TransactionalSmsResult>;
    /** Remaining SMS credits, or null when it cannot be read. */
    balance(): Promise<string | undefined>;
}

/** No credentials configured — log the send instead of silently doing nothing. */
export class ConsoleTransactionalSmsProvider implements TransactionalSmsProvider {
    readonly name = 'console';
    private readonly logger = new Logger('Sms:console');

    async sendTemplate(
        toE164: string,
        dltTemplateId: string,
        message: string,
    ): Promise<TransactionalSmsResult> {
        this.logger.log(
            `[not sent — no provider configured] dlt=${dltTemplateId} → ${toE164} · ${message.replace(/\s+/g, ' ').slice(0, 120)}…`,
        );
        return { ok: true };
    }

    async balance(): Promise<string | undefined> {
        return undefined;
    }
}

export class SmsJustProvider implements TransactionalSmsProvider {
    readonly name = 'smsjust';
    private readonly logger = new Logger('Sms:smsjust');

    /** The gateway answers quickly or not at all; the timeout is for a hung socket. */
    private static readonly TIMEOUT_MS = 15_000;

    constructor(
        private readonly endpoint: string,
        private readonly username: string,
        private readonly password: string,
        private readonly senderId: string,
        private readonly entityId: string,
    ) {}

    /** Keeps the password out of anything on its way to a log line. */
    private redact(text: string): string {
        return this.password ? text.split(this.password).join('***') : text;
    }

    /**
     * The gateway addresses a handset by country code + subscriber number, no `+`.
     * Same shape WATI wants — everything upstream is E.164.
     */
    private toGatewayNumber(toE164: string): string {
        return (toE164 ?? '').replace(/\D/g, '');
    }

    async sendTemplate(
        toE164: string,
        dltTemplateId: string,
        message: string,
    ): Promise<TransactionalSmsResult> {
        const number = this.toGatewayNumber(toE164);
        if (!number) return { ok: false, error: 'No phone number' };

        // Standard URL encoding handles every reserved character (`&`, `#`,
        // `+`, `,` included) — the gateway URL-decodes the query string like
        // any PHP endpoint, so `encodeURIComponent` per value is correct and
        // the doc's manual `amp;`/`;hash`/`plus;` replacements are unnecessary.
        const params = new URLSearchParams({
            username: this.username,
            pass: this.password,
            senderid: this.senderId,
            dest_mobileno: number,
            msgtype: 'TXT',
            message,
            entityid: this.entityId,
            templateid: dltTemplateId,
            response: 'Y',
        });
        const url = `${this.endpoint}?${params.toString()}`;

        try {
            const res = await fetch(url, {
                method: 'GET',
                signal: AbortSignal.timeout(SmsJustProvider.TIMEOUT_MS),
            });
            const text = (await res.text().catch(() => '')).trim();

            if (!res.ok) {
                return { ok: false, error: `SMS gateway ${res.status}: ${this.redact(text.slice(0, 300))}` };
            }

            // Success answers a submission id like `5068570-2008_12_29`. Every
            // failure mode — ES1001 auth, ES1004 sender, ES1009 number,
            // ES1013 template, balance, expiry — answers prose instead.
            const scheduleId = /^(\d+-\d{4}_\d{2}_\d{2})/.exec(text)?.[1];
            if (!scheduleId) {
                return { ok: false, error: `SMS gateway rejected: ${this.redact(text.slice(0, 300))}` };
            }

            return { ok: true, scheduleId };
        } catch (err) {
            return { ok: false, error: this.redact((err as Error).message) };
        }
    }

    /** `balance_check.php` answers `Your Balance is : 2313` — pass it through. */
    async balance(): Promise<string | undefined> {
        try {
            const params = new URLSearchParams({ username: this.username, pass: this.password });
            const res = await fetch(`${this.balanceEndpoint}?${params.toString()}`, {
                signal: AbortSignal.timeout(SmsJustProvider.TIMEOUT_MS),
            });
            const text = (await res.text().catch(() => '')).trim();
            if (!res.ok) return `unavailable: ${this.redact(text.slice(0, 200))}`;
            return text.replace(/\s+/g, ' ').slice(0, 100) || 'empty response';
        } catch (err) {
            return `unavailable: ${this.redact((err as Error).message)}`;
        }
    }

    private get balanceEndpoint(): string {
        // `…/sms/user/urlsms.php` → `…/sms/user/balance_check.php`
        return this.endpoint.replace(/urlsms\.php.*$/, 'balance_check.php');
    }
}
