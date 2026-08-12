import {
    WHATSAPP_TEMPLATES,
    formatIstOrdinalDate,
    formatIstTime,
    formatIstWeekdayDate,
    formatPercentile,
    reminderParams,
    resultParams,
    sanitizeParam,
    scheduleParams,
    submissionParams,
} from './whatsapp.templates';

/**
 * The variables of four frozen, Meta-approved templates.
 *
 * These tests exist because the failure modes here are silent and public. A
 * template whose variables are the wrong way round is *delivered* — the student
 * reads "Time: 16th August 2026 IST" and turns up on the wrong day, and nothing
 * in any log says anything went wrong. And a message rendered in the server's
 * UTC clock rather than IST is off by 5½ hours, which on an afternoon exam is a
 * different date.
 */

// 2026-08-18T09:30Z is 3:00 PM IST on Tuesday 18 August 2026. Chosen because
// its UTC date and its IST date are the same, and its UTC *time* is not — so a
// formatter that forgot the timezone fails on the time here, and the late-
// evening cases below catch the ones that also change the date.
const AFTERNOON = new Date('2026-08-18T09:30:00.000Z');

describe('IST formatting', () => {
    it('renders the approved sample date exactly', () => {
        expect(formatIstOrdinalDate(AFTERNOON)).toBe('18th August 2026');
    });

    it('renders the approved sample time exactly, in IST and not UTC', () => {
        // The bug this catches: 09:30 is the UTC hour. A student told "9:30 AM"
        // for a 3 PM paper misses it entirely.
        expect(formatIstTime(AFTERNOON, true)).toBe('3:00 PM');
        expect(formatIstTime(AFTERNOON, false)).toBe('3:00PM');
    });

    it('renders the approved reminder date format, with the weekday', () => {
        expect(formatIstWeekdayDate(new Date('2026-06-20T09:30:00.000Z'))).toBe(
            'Saturday 20 June 2026',
        );
    });

    it('uses tomorrow’s IST date for a late-evening slot', () => {
        // 19:00 UTC is 00:30 IST the *next* day. A naive UTC formatter reports
        // the 17th; the student's exam is on the 18th.
        const lateUtc = new Date('2026-08-17T19:00:00.000Z');
        expect(formatIstOrdinalDate(lateUtc)).toBe('18th August 2026');
        expect(formatIstTime(lateUtc)).toBe('12:30 AM');
    });

    it('handles midnight and noon IST without rolling to 0 o’clock', () => {
        expect(formatIstTime(new Date('2026-08-17T18:30:00.000Z'))).toBe('12:00 AM');
        expect(formatIstTime(new Date('2026-08-18T06:30:00.000Z'))).toBe('12:00 PM');
    });

    it.each([
        ['2026-08-01T09:30:00.000Z', '1st August 2026'],
        ['2026-08-02T09:30:00.000Z', '2nd August 2026'],
        ['2026-08-03T09:30:00.000Z', '3rd August 2026'],
        ['2026-08-04T09:30:00.000Z', '4th August 2026'],
        // The teens are the ordinal rule everyone gets wrong: 11/12/13 take
        // "th", not "st"/"nd"/"rd".
        ['2026-08-11T09:30:00.000Z', '11th August 2026'],
        ['2026-08-12T09:30:00.000Z', '12th August 2026'],
        ['2026-08-13T09:30:00.000Z', '13th August 2026'],
        ['2026-08-21T09:30:00.000Z', '21st August 2026'],
        ['2026-08-22T09:30:00.000Z', '22nd August 2026'],
        ['2026-08-23T09:30:00.000Z', '23rd August 2026'],
        ['2026-08-31T09:30:00.000Z', '31st August 2026'],
    ])('ordinalises %s as %s', (iso, expected) => {
        expect(formatIstOrdinalDate(new Date(iso))).toBe(expected);
    });
});

describe('formatPercentile', () => {
    it('drops a trailing zero so a whole number reads like the approved sample', () => {
        expect(formatPercentile(68)).toBe('68');
        expect(formatPercentile(68.0)).toBe('68');
    });

    it('keeps one decimal when the percentile actually has one', () => {
        expect(formatPercentile(99.5)).toBe('99.5');
        expect(formatPercentile(68.44)).toBe('68.4');
    });
});

describe('sanitizeParam', () => {
    // Meta rejects the *whole send* for a parameter containing a newline, a tab
    // or four-plus consecutive spaces. A name pasted with a line break would
    // otherwise take out the message with a baffling provider error.
    it('flattens newlines, tabs and runs of spaces', () => {
        expect(sanitizeParam('Akash\nKumar')).toBe('Akash Kumar');
        expect(sanitizeParam('Akash\tKumar')).toBe('Akash Kumar');
        expect(sanitizeParam('Akash     Kumar')).toBe('Akash Kumar');
        expect(sanitizeParam('  Akash  ')).toBe('Akash');
    });

    it('survives a null or undefined value rather than throwing', () => {
        expect(sanitizeParam(undefined as unknown as string)).toBe('');
        expect(sanitizeParam(null as unknown as string)).toBe('');
    });
});

describe('template parameters', () => {
    it('names parameters positionally, as the approved templates declare them', () => {
        // WATI matches on `name`, not on array order. A parameter named "0" is
        // silently ignored and the send is rejected for a variable-count mismatch.
        const p = scheduleParams({ firstName: 'Rajesh', startsAt: AFTERNOON });
        expect(p.map((x) => x.name)).toEqual(['1', '2', '3']);
    });

    it('builds bio_submission as (name, date)', () => {
        expect(submissionParams({ firstName: 'Akash', submittedAt: AFTERNOON })).toEqual([
            { name: '1', value: 'Akash' },
            { name: '2', value: '18th August 2026' },
        ]);
    });

    it('builds bio_schedule as (name, date, time) — not (name, time, date)', () => {
        expect(scheduleParams({ firstName: 'Rajesh', startsAt: AFTERNOON })).toEqual([
            { name: '1', value: 'Rajesh' },
            { name: '2', value: '18th August 2026' },
            { name: '3', value: '3:00 PM' },
        ]);
    });

    it('builds bio_result as (name, percentile, rank) — not (name, rank, percentile)', () => {
        // Swapping these delivers a plausible-looking message that tells a
        // student in the 68th percentile they are ranked 68th in India.
        expect(resultParams({ firstName: 'Akash', percentile: 68, rank: 1067 })).toEqual([
            { name: '1', value: 'Akash' },
            { name: '2', value: '68' },
            { name: '3', value: '1067' },
        ]);
    });

    it('builds bio_reminder with the weekday date and the unspaced time', () => {
        expect(
            reminderParams({ firstName: 'Rajesh', startsAt: new Date('2026-06-20T09:30:00.000Z') }),
        ).toEqual([
            { name: '1', value: 'Rajesh' },
            { name: '2', value: 'Saturday 20 June 2026' },
            { name: '3', value: '3:00PM' },
        ]);
    });
});

describe('WHATSAPP_TEMPLATES', () => {
    // Verified against the live tenant's getMessageTemplates. A typo here is a
    // WATI rejection at send time and nothing earlier.
    it('names the four approved templates exactly', () => {
        expect(Object.values(WHATSAPP_TEMPLATES)).toEqual([
            'bio_submission',
            'bio_schedule',
            'bio_result',
            'bio_reminder',
        ]);
    });
});
