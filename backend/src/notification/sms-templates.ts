import { formatIstOrdinalDate, formatIstTime } from './whatsapp.templates';

/**
 * The five DLT-approved transactional SMS templates, and the only place their
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
    registration: { name: 'BIOREGISTRATION', dltId: '1777178939340857740' },
    /** Sent when a seat is confirmed — the student's date and time. */
    schedule: { name: 'BIOSCHEDULE', dltId: '1777178938193640968' },
    /** Sent once, right after registration — the device/environment checklist. */
    requirements: { name: 'BIOEXAMREQUIREMENTS', dltId: '1777178939292597525' },
    /** Sent the day before the exam. */
    reminder: { name: 'BIOREMINDER', dltId: '1777178938220865501' },
    /** Sent once, when a paper is submitted. */
    submission: { name: 'BIOSUBMISSION', dltId: '1777178938155054822' },
} as const;

export type SmsTemplateKey = keyof typeof SMS_TEMPLATES;

/** Make a value safe inside a template variable: no newline/tab runs. */
function clean(value: string): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * `Congratulations ! Your registration … Your roll number is {1}.`
 *
 * Approved body (BIOREGISTRATION · 1777178939340857740):
 *   Congratulations ! Your registration with Bharat Innovation Olympiad is
 *   confirmed. Please check your email for more details including your exam
 *   schedule. Your roll number is {#alp#}.
 *   Thanks.
 *   Bharat Innovation Olympiad team - Lemon Ideas
 */
export function registrationMessage(vars: { rollNumber: string }): string {
    return [
        'Congratulations ! Your registration with Bharat Innovation Olympiad is confirmed. ' +
            `Please check your email for more details including your exam schedule. ` +
            `Your roll number is ${clean(vars.rollNumber)}.`,
        'Thanks.',
        'Bharat Innovation Olympiad team - Lemon Ideas',
    ].join('\n');
}

/**
 * `Hi {1}, Your schedule … Date : {2} Time: {3} IST | Online …`
 *
 * Approved body (BIOSCHEDULE · 1777178938193640968):
 *   Hi {#alp#},
 *   Your schedule for the Bharat Innovation Olympiad exam is as follows:
 *   Date : {#alp#}
 *   Time: {#alp#} IST | Online
 *   Please check your email for complete details.
 *   For queries, contact the Olympiad WA helpline at +918421411142
 *   Bharat Olympiad team | Lemon Ideas India
 *
 * The body already writes "IST" after the variable, so {3} carries the clock
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
        'Hi,',
        'Your schedule for the Bharat Innovation Olympiad exam is as follows:',
        `Date : ${date}`,
        `Time: ${time} IST | Online`,
        'Please check your email for complete details.',
        'For queries, contact the Olympiad WA helpline at +918421411142',
        'Bharat Olympiad team | Lemon Ideas India',
    ].join('\n');
}

/**
 * Static body — no variables (BIOEXAMREQUIREMENTS · 1777178939292597525).
 */
export function examRequirementsMessage(): string {
    return [
        'Please note the following requirements for your Bharat Innovation Olympiad online exam.',
        '1. Laptop/PC/Desktop computer',
        '2. Windows OS 10+ or macOS 10.14+',
        '3. Internet connection with min 2 Mbps',
        '4. Working web cam/camera',
        '5. Peaceful place with solid & plain background',
        'Please use practice test to get comfortable with the online exam environment',
        '',
        'All the best ! Bharat Innovation Olympiad team- Lemon Ideas',
    ].join('\n');
}

/**
 * `This is a reminder for your Bharat Innovation Olympiad exam scheduled for - {1} at {2} IST.`
 *
 * Approved body (BIOREMINDER · 1777178938220865501). Only ever correct on the
 * day before the exam — the reminder sweeper is the only caller.
 */
export function reminderMessage(vars: { startsAt: Date }): string {
    const date = formatIstOrdinalDate(vars.startsAt);
    const time = formatIstTime(vars.startsAt, false);
    return [
        `This is a reminder for your Bharat Innovation Olympiad exam scheduled for - ${date} at ${time} IST.`,
        'Please check your email for more details, preparations and the portal link.',
        'For queries, please contact the WA helpline number.',
        'Bharat Olympiad team | Lemon Ideas India',
    ].join('\n');
}

/**
 * `Hi {1}, This is a confirmation regarding your successful exam submission …`
 *
 * Approved body (BIOSUBMISSION · 1777178938155054822) — note the two blank
 * lines before the sign-off are part of the approved body.
 */
export function submissionMessage(vars: { submittedAt: Date }): string {
    return [
        'Hi,',
        'This is a confirmation regarding your successful exam submission at the ' +
            `Bharat Innovation Olympiad organised by Lemon Ideas on ${formatIstOrdinalDate(vars.submittedAt)}`,
        '',
        '',
        'Bharat Olympiad team | Lemon Ideas India',
    ].join('\n');
}
