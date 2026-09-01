import { WatiParam } from './whatsapp.provider';

/**
 * The four Meta-approved Innovation Olympiad templates, and the only place their variables are
 * built.
 *
 * ## Why the bodies are copied in here as comments
 *
 * An approved template body is frozen: Meta reviewed those exact words, and the
 * only thing this codebase may vary is the variables. A send whose variable
 * *count* does not match the approved body is rejected outright by WATI, and a
 * send whose variables are the wrong way round is delivered and wrong — a
 * student told their exam is at "16th August 2026" o'clock. Having the body
 * beside the builder is what makes "is {{2}} the date or the time?" answerable
 * without opening the WATI dashboard.
 *
 * Verified against the live tenant's `getMessageTemplates` on 2026-08-13: all
 * four are APPROVED, language `en_US`, with positional parameters named "1",
 * "2", "3".
 *
 * ## Why everything here is IST
 *
 * The exam is an Indian olympiad run to a published IST timetable, and the
 * server clock is UTC. Formatting against the server's local zone would tell a
 * student sitting a 3:00 PM IST paper that it starts at 9:30 AM.
 */

/** The template names exactly as approved on the WATI account. */
export const WHATSAPP_TEMPLATES = {
    /** Sent once, when a paper is submitted. */
    submission: 'bio_submission',
    /** Sent when a seat is confirmed — the student's date and time. */
    schedule: 'bio_schedule',
    /** Sent when the final (non-provisional) report is published. */
    result: 'bio_result',
    /** Sent the day before the exam. */
    reminder: 'bio_reminder',
} as const;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

const IST = 'Asia/Kolkata';

/** `1` → `1st`, `22` → `22nd`. English ordinals, as the approved samples use them. */
function ordinal(day: number): string {
    const teen = day % 100;
    if (teen >= 11 && teen <= 13) return `${day}th`;
    switch (day % 10) {
        case 1: return `${day}st`;
        case 2: return `${day}nd`;
        case 3: return `${day}rd`;
        default: return `${day}th`;
    }
}

function istParts(when: Date): Record<string, string> {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: IST,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).formatToParts(when);

    const out: Record<string, string> = {};
    for (const p of parts) out[p.type] = p.value;
    return out;
}

/** `18th August 2026` — the sample format of `bio_submission` and `bio_schedule`. */
export function formatIstOrdinalDate(when: Date): string {
    const p = istParts(when);
    return `${ordinal(Number(p.day))} ${p.month} ${p.year}`;
}

/** `Saturday 20 June 2026` — the sample format of `bio_reminder`, which names the day. */
export function formatIstWeekdayDate(when: Date): string {
    const p = istParts(when);
    return `${p.weekday} ${Number(p.day)} ${p.month} ${p.year}`;
}

/**
 * `3:00 PM` (schedule) or `3:00PM` (reminder).
 *
 * The two approved samples space the meridiem differently. That is not worth
 * arguing with — it is one boolean here and it keeps each message identical to
 * what was signed off.
 */
export function formatIstTime(when: Date, spaced = true): string {
    const p = istParts(when);
    const meridiem = (p.dayPeriod ?? '').toUpperCase().replace(/[^AMP]/g, '');
    return `${p.hour}:${p.minute}${spaced ? ' ' : ''}${meridiem}`;
}

/**
 * `68` from 68, `99.5` from 99.5 — never `68.0`.
 *
 * Rounded to one decimal because a percentile carries no meaning past that, and
 * trailing zeros are stripped so the common case reads like the approved sample.
 */
export function formatPercentile(percentile: number): string {
    return String(Math.round(percentile * 10) / 10);
}

/**
 * Make a value safe to put in a WhatsApp template variable.
 *
 * Meta rejects a parameter containing a newline, a tab, or a run of four or more
 * spaces — the whole send fails, not just that variable. Nothing here is
 * expected to contain them, which is exactly why an unexpected one (a name
 * pasted with a line break, a slot label from an admin form) would be a baffling
 * outage rather than an obvious bug.
 */
export function sanitizeParam(value: string): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function params(...values: string[]): WatiParam[] {
    return values.map((value, i) => ({ name: String(i + 1), value: sanitizeParam(value) }));
}

/**
 * Hi {{1}},
 *     This is a confirmation regarding your successful submission at the Bharat
 * Innovation Olympiad organised by Lemon Ideas on  {{2}}
 *
 * Bharat Olympiad team | Lemon Ideas India
 */
export function submissionParams(vars: { firstName: string; submittedAt: Date }): WatiParam[] {
    return params(vars.firstName, formatIstOrdinalDate(vars.submittedAt));
}

/**
 * Hi {{1}},
 * Your schedule for the Bharat Innovation Olympiad is as follows:
 *
 * Date :  {{2}} |
 * Time: {{3}} IST | Online
 * …
 *
 * The body already writes "IST" after the variable, so {{3}} carries the clock
 * time alone.
 */
export function scheduleParams(vars: { firstName: string; startsAt: Date }): WatiParam[] {
    return params(
        vars.firstName,
        formatIstOrdinalDate(vars.startsAt),
        formatIstTime(vars.startsAt, true),
    );
}

/**
 * Hi {{1}},
 * Your verified score and rank for the Bharat Innovation Olympiad are now available.
 * Percentile {{2}}
 * India rank: {{3}}
 * …
 */
export function resultParams(vars: {
    firstName: string;
    percentile: number;
    rank: number;
}): WatiParam[] {
    return params(vars.firstName, formatPercentile(vars.percentile), String(vars.rank));
}

/**
 * Hi {{1}},
 * This is a reminder for your Bharat Innovation Olympiad exam scheduled for
 * tomorrow - {{2}} at {{3}} IST.
 * …
 *
 * The body says "tomorrow", so this template is only ever correct on the day
 * before the exam — see `whatsapp-reminder.service.ts`, which is the only caller.
 */
export function reminderParams(vars: { firstName: string; startsAt: Date }): WatiParam[] {
    return params(
        vars.firstName,
        formatIstWeekdayDate(vars.startsAt),
        formatIstTime(vars.startsAt, false),
    );
}
