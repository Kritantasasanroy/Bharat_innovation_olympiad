import { formatIstOrdinalDate, formatIstTime } from './whatsapp.templates';

/**
 * The nine DLT-approved transactional SMS templates, and the only place their
 * variables are built.
 *
 * ## Why the bodies are copied in here verbatim
 *
 * India's DLT (Distributed Ledger Technology) registry — the TRAI mandate every
 * Indian SMS gateway enforces — approved these exact bodies. The gateway
 * scrubs every send against the registered template for the given
 * `templateid`, and a message whose text does not match the approved body
 * (extra space, missing line break, different punctuation) is rejected or
 * silently dropped. So — exactly like `whatsapp.templates.ts` — the approved
 * body lives beside its builder and the only thing that varies is the
 * variable values.
 *
 * Template ids and the entity id are the DLT registry's identifiers; both are
 * required query parameters on every SMS Just send.
 *
 * ## The eight, and what wires to what
 *
 * - `registration` → BIOREGISTRATIONNEW
 * - `schedule` → BIOSCHEDULENEW
 * - `requirementsNew` → BIOEXAMREQUIREMENTSNEW (the exam checklist)
 * - `reminder` → BIOREMINDER
 * - `submission` → BIOSUBMISSIONNEW
 * - `support` → BIOSUPPORTNEW (support-ticket acknowledgement)
 * - `verificationPending` → BIOVERIFICATIONPENDING (T-1 identification nudge)
 * - `paymentPending` → BIOPAYMENTPENDINGLOGIN (1h unpaid-registration nudge)
 *
 * ## Formatting
 *
 * The approved samples show `28th September 2026` and `9:00AM` — the same
 * ordinal-date format the WhatsApp templates use, but with the meridiem
 * **unspaced**. `formatIstOrdinalDate` and `formatIstTime(when, false)` from
 * the WhatsApp template module produce exactly those, so the two channels
 * never disagree about what day or time a sitting is.
 */

/** The DLT template names exactly as approved, with their registry ids. */
export const SMS_TEMPLATES = {
    /** Sent once, when the access pass first activates (roll number issued). */
    registration: { name: 'BIOREGISTRATIONNEW', dltId: '1777178947235672764' },
    /** Sent when a seat is confirmed — the student's date and time. */
    schedule: { name: 'BIOSCHEDULENEW', dltId: '1777178947263648938' },
    /** Sent once, right after registration — the device/environment checklist. */
    requirementsNew: { name: 'BIOEXAMREQUIREMENTSNEW', dltId: '1777178947312261549' },
    /** Sent the day before the exam. */
    reminder: { name: 'BIOREMINDER', dltId: '1777178947335107615' },
    /** Sent once, when a paper is submitted. */
    submission: { name: 'BIOSUBMISSIONNEW', dltId: '1777178947412171476' },
    /** Sent when a support ticket is raised. */
    support: { name: 'BIOSUPPORTNEW', dltId: '1777178947513266672' },
    /** Sent at T-1 to students who never completed student identification. */
    verificationPending: { name: 'BIOVERIFICATIONPENDING', dltId: '1777178949269638040' },
    /** Sent an hour after an OTP-verified registration that never paid. */
    paymentPending: { name: 'BIOPAYMENTPENDINGLOGIN', dltId: '1777178953351456750' },
} as const;

export type SmsTemplateKey = keyof typeof SMS_TEMPLATES;

/** Make a value safe inside a template variable: no newline/tab runs. */
function clean(value: string): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * `Your registration … Your roll number is {1}.`
 *
 * Approved body (BIOREGISTRATIONNEW · 1777178947235672764):
 *   Your registration with Bharat Innovation Olympiad is confirmed. Your roll
 *   number is {#alp#}.
 *   Check email for more
 *   Thanks
 *   - Lemon Ideas Team
 */
export function registrationMessage(vars: { rollNumber: string }): string {
    return [
        'Your registration with Bharat Innovation Olympiad is confirmed. ' +
            `Your roll number is ${clean(vars.rollNumber)}.`,
        'Check email for more',
        'Thanks',
        '- Lemon Ideas Team',
    ].join('\n');
}

/**
 * `Your … exam is scheduled on {1} at {2} IST | Online …`
 *
 * Approved body (BIOSCHEDULENEW · 1777178947263648938):
 *   Your Bharat Innovation Olympiad exam is scheduled on {#alp#} at {#alp#} IST | Online
 *   Please check your email for more
 *   - Lemon Ideas Team
 *
 * The body already writes "IST" after the variable, so {2} carries the clock
 * time alone — and unspaced, per the approved sample ("9:00AM").
 */
export function scheduleSmsParams(vars: { startsAt: Date }): { date: string; time: string } {
    return {
        date: formatIstOrdinalDate(vars.startsAt),
        time: formatIstTime(vars.startsAt, false),
    };
}

export function scheduleMessage(vars: { startsAt: Date }): string {
    const { date, time } = scheduleSmsParams(vars);
    return [
        `Your Bharat Innovation Olympiad exam is scheduled on ${date} at ${time} IST | Online`,
        'Please check your email for more',
        '- Lemon Ideas Team',
    ].join('\n');
}

/**
 * Static body — no variables (BIOEXAMREQUIREMENTSNEW · 1777178947312261549).
 * The re-approved wording — no space after the list numbers, "OS10+".
 */
export function examRequirementsNewMessage(): string {
    return [
        'Please note the requirements for your Bharat Innovation Olympiad online exam.',
        '1.Laptop/PC/Desktop computer',
        '2.Windows OS10+ or macOS10.14+',
        '3.Internet connection with min 2 Mbps',
        '4.Working web cam/camera',
        '5.Peaceful place with solid & plain background',
        'Please use practice test to be prepared for exam',
        '- Lemon Ideas Team',
    ].join('\n');
}

/**
 * `This is a reminder … scheduled for - {1} at {2} IST.`
 *
 * Approved body (BIOREMINDER · 1777178947335107615). Only ever correct on the
 * day before the exam — the reminder sweeper is the only caller.
 */
export function reminderMessage(vars: { startsAt: Date }): string {
    const { date, time } = scheduleSmsParams(vars);
    return [
        `This is a reminder for your Bharat Innovation Olympiad exam scheduled for - ${date} at ${time} IST.`,
        '- Lemon Ideas India',
    ].join('\n');
}

/**
 * `This is a confirmation regarding your successful exam submission …`
 *
 * Approved body (BIOSUBMISSIONNEW · 1777178947412171476) — the new body no
 * longer carries the student's name; the date variable is the only fill-in.
 */
export function submissionMessage(vars: { submittedAt: Date }): string {
    return [
        'This is a confirmation regarding your successful exam submission at the ' +
            `Bharat Innovation Olympiad organised by Lemon Ideas on ${formatIstOrdinalDate(vars.submittedAt)}`,
        '- Lemon Ideas Team',
    ].join('\n');
}

/**
 * `Your support ticket with reference Id {1} …`
 *
 * Approved body (BIOSUPPORTNEW · 1777178947513266672).
 */
export function supportMessage(vars: { ticketRef: string }): string {
    return [
        'Your support ticket with reference Id ' +
            `${clean(vars.ticketRef)} has been submitted for Bharat Innovation Olympiad. ` +
            'You will be updated on this shortly.',
        '- Lemon ideas Team',
    ].join('\n');
}

/**
 * Static body — no variables (BIOVERIFICATIONPENDING · 1777178949269638040).
 * Sent at T-1 to a student who has not completed student identification.
 * The approved body links to /profile/ — not /dashboard/.
 */
export function verificationPendingMessage(): string {
    return [
        'Bharat Innovation Olympiad verification is pending. Please complete your ' +
            'face scan/ID upload: https://www.innovationolympiad.in/profile/',
        '- Lemon Ideas Team',
    ].join('\n');
}

/**
 * Static body — no variables (BIOPAYMENTPENDINGLOGIN · 1777178953351456750).
 * Sent an hour after an OTP-verified registration that has not paid.
 */
export function paymentPendingMessage(): string {
    return [
        'Your Bharat Innovation Olympiad registration is incomplete as payment is pending.',
        'If payment failed, please try again from the portal,',
        'https://www.innovationolympiad.in/login/',
        '',
        'If payment was deducted, contact support before making another payment: WA HELPLINE- +918421411142.',
        '- Lemon Ideas Team',
    ].join('\n');
}
