/**
 * The slot-search rule, pinned down date by date.
 *
 * The policy is easy to state and easy to get subtly wrong — off by one day at
 * the lead boundary, ordered by date instead of by preference, or reading the
 * weekday off a UTC instant instead of an IST one. Each of those produces a
 * schedule that looks plausible and is wrong for a whole cohort, so every one of
 * them has a test here.
 */
import {
    candidateDates,
    formatMinuteOfDay,
    istStartOfDay,
    istTimeOnDay,
    istWeekday,
    parseMinuteOfDay,
    weekdayName,
} from './slot-assignment.rules';

/** An IST wall-clock moment, as the UTC instant the server would store. */
const ist = (iso: string) => new Date(`${iso}+05:30`);

/** `YYYY-MM-DD` of an IST-midnight instant, for readable assertions. */
const day = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

const DEFAULTS = { leadDays: 14, horizonDays: 56, dayPreference: [0, 6] };

describe('istWeekday / istStartOfDay', () => {
    it('reads the weekday in IST, not UTC', () => {
        // 00:30 IST on Sunday 6 Sep 2026 is 19:00 UTC on Saturday the 5th.
        // A server reading `getUTCDay()` would call this a Saturday.
        const earlySunday = ist('2026-09-06T00:30:00');
        expect(earlySunday.getUTCDay()).toBe(6); // what the naive read gives
        expect(istWeekday(earlySunday)).toBe(0); // what the rule needs
        expect(weekdayName(istWeekday(earlySunday))).toBe('Sunday');
    });

    it('collapses any moment in a day to the same IST midnight', () => {
        const morning = istStartOfDay(ist('2026-09-06T00:00:00'));
        const nearMidnight = istStartOfDay(ist('2026-09-06T23:59:59'));
        expect(morning.getTime()).toBe(nearMidnight.getTime());
        expect(day(morning)).toBe('2026-09-06');
    });

    it('handles instants before the epoch offset without drifting a day', () => {
        // 04:00 IST is 22:30 UTC the previous day — the case a naive
        // `setUTCHours(0,0,0,0)` gets wrong.
        expect(day(istStartOfDay(ist('2026-09-06T04:00:00')))).toBe('2026-09-06');
    });
});

describe('candidateDates — the specified policy', () => {
    it('offers the first Sunday at least two weeks out', () => {
        // Registered Tuesday 1 Sep 2026. Two weeks on is Tue 15 Sep; the first
        // Sunday on or after that is 20 Sep.
        const dates = candidateDates({ registeredAt: ist('2026-09-01T10:00:00'), ...DEFAULTS });
        expect(day(dates[0].date)).toBe('2026-09-20');
        expect(dates[0].weekday).toBe(0);
        expect(dates[0].daysFromRegistration).toBe(19);
    });

    it('walks Sunday by Sunday out to the eight-week horizon', () => {
        const dates = candidateDates({ registeredAt: ist('2026-09-01T10:00:00'), ...DEFAULTS });
        const sundays = dates.filter((d) => d.weekday === 0).map((d) => day(d.date));
        expect(sundays).toEqual([
            '2026-09-20',
            '2026-09-27',
            '2026-10-04',
            '2026-10-11',
            '2026-10-18',
            '2026-10-25',
        ]);
        // 1 Sep + 56 days = 27 Oct, so 25 Oct is the last Sunday that fits and
        // 1 Nov is correctly excluded.
        expect(sundays).not.toContain('2026-11-01');
    });

    it('tries every Sunday before it tries any Saturday', () => {
        const dates = candidateDates({ registeredAt: ist('2026-09-01T10:00:00'), ...DEFAULTS });
        const firstSaturdayAt = dates.findIndex((d) => d.weekday === 6);
        const lastSundayAt = dates.map((d) => d.weekday).lastIndexOf(0);

        expect(lastSundayAt).toBeLessThan(firstSaturdayAt);
        // Specifically: the Saturday of 19 Sep is *not* offered ahead of the
        // Sunday of 25 Oct, even though it is five weeks earlier. Preference
        // beats proximity — that is the whole point of the rule.
        expect(day(dates[firstSaturdayAt].date)).toBe('2026-09-19');
        expect(day(dates[lastSundayAt].date)).toBe('2026-10-25');
    });

    it('falls to Saturdays in date order once the Sundays run out', () => {
        const dates = candidateDates({ registeredAt: ist('2026-09-01T10:00:00'), ...DEFAULTS });
        const saturdays = dates.filter((d) => d.weekday === 6).map((d) => day(d.date));
        expect(saturdays).toEqual([
            '2026-09-19',
            '2026-09-26',
            '2026-10-03',
            '2026-10-10',
            '2026-10-17',
            '2026-10-24',
        ]);
    });

    it('includes the lead day itself when it is a preferred weekday', () => {
        // Registered Sunday 6 Sep; exactly two weeks later is Sunday 20 Sep,
        // which must be offered rather than skipped to the 27th.
        const dates = candidateDates({ registeredAt: ist('2026-09-06T09:00:00'), ...DEFAULTS });
        expect(day(dates[0].date)).toBe('2026-09-20');
        expect(dates[0].daysFromRegistration).toBe(14);
    });

    it('includes the horizon day itself when it is a preferred weekday', () => {
        // Registered Sunday 6 Sep; +56 days is Sunday 1 Nov — the boundary is
        // inclusive, so it is the last Sunday offered.
        const dates = candidateDates({ registeredAt: ist('2026-09-06T09:00:00'), ...DEFAULTS });
        const sundays = dates.filter((d) => d.weekday === 0).map((d) => day(d.date));
        expect(sundays[sundays.length - 1]).toBe('2026-11-01');
    });

    it('ignores the time of day a student registered at', () => {
        const earlyBird = candidateDates({ registeredAt: ist('2026-09-01T00:01:00'), ...DEFAULTS });
        const nightOwl = candidateDates({ registeredAt: ist('2026-09-01T23:59:00'), ...DEFAULTS });
        expect(earlyBird.map((d) => day(d.date))).toEqual(nightOwl.map((d) => day(d.date)));
    });

    it('does not drift when a student registers just before IST midnight', () => {
        // 23:30 IST on 1 Sep is 18:00 UTC on 1 Sep — but 00:30 IST on 2 Sep is
        // 19:00 UTC on the *1st*, and must count as the 2nd.
        const late = candidateDates({ registeredAt: ist('2026-09-01T23:30:00'), ...DEFAULTS });
        const justAfter = candidateDates({ registeredAt: ist('2026-09-02T00:30:00'), ...DEFAULTS });
        expect(day(late[0].date)).toBe('2026-09-20');
        expect(day(justAfter[0].date)).toBe('2026-09-20');
        expect(late[0].daysFromRegistration).toBe(19);
        expect(justAfter[0].daysFromRegistration).toBe(18);
    });
});

describe('candidateDates — configurability and edge cases', () => {
    it('honours a different preference order', () => {
        const dates = candidateDates({
            registeredAt: ist('2026-09-01T10:00:00'),
            leadDays: 14,
            horizonDays: 28,
            dayPreference: [6, 0], // Saturdays first
        });
        expect(dates[0].weekday).toBe(6);
        expect(day(dates[0].date)).toBe('2026-09-19');
    });

    it('supports more than two preferred days, in order', () => {
        const dates = candidateDates({
            registeredAt: ist('2026-09-01T10:00:00'),
            leadDays: 14,
            horizonDays: 21,
            dayPreference: [0, 6, 3], // Sunday, then Saturday, then Wednesday
        });
        expect(dates.map((d) => `${weekdayName(d.weekday)} ${day(d.date)}`)).toEqual([
            'Sunday 2026-09-20',
            'Saturday 2026-09-19',
            'Wednesday 2026-09-16',
        ]);
    });

    it('never offers the same date twice when a weekday is listed twice', () => {
        const dates = candidateDates({
            registeredAt: ist('2026-09-01T10:00:00'),
            leadDays: 14,
            horizonDays: 28,
            dayPreference: [0, 0],
        });
        expect(new Set(dates.map((d) => d.date.getTime())).size).toBe(dates.length);
    });

    it('returns nothing rather than throwing when the rules are unsatisfiable', () => {
        expect(
            candidateDates({
                registeredAt: ist('2026-09-01T10:00:00'),
                leadDays: 14,
                horizonDays: 56,
                dayPreference: [],
            }),
        ).toEqual([]);

        expect(
            candidateDates({
                registeredAt: ist('2026-09-01T10:00:00'),
                leadDays: 56,
                horizonDays: 14,
                dayPreference: [0],
            }),
        ).toEqual([]);
    });

    it('returns nothing when the window is too narrow to contain the weekday', () => {
        // Registered Monday; a lead of 14 and horizon of 15 covers Mon–Tue only.
        expect(
            candidateDates({
                registeredAt: ist('2026-09-07T10:00:00'),
                leadDays: 14,
                horizonDays: 15,
                dayPreference: [0],
            }),
        ).toEqual([]);
    });

    it('survives a leap day and a month boundary', () => {
        // 2028 is a leap year: 14 days after 17 Feb is 2 Mar, not 3 Mar.
        const dates = candidateDates({
            registeredAt: ist('2028-02-17T10:00:00'),
            leadDays: 14,
            horizonDays: 21,
            dayPreference: [0],
        });
        expect(day(dates[0].date)).toBe('2028-03-05');
    });
});

describe('time-of-day helpers', () => {
    it('round-trips HH:mm through minutes from midnight', () => {
        expect(parseMinuteOfDay('10:00')).toBe(600);
        expect(parseMinuteOfDay('09:30')).toBe(570);
        expect(parseMinuteOfDay('00:00')).toBe(0);
        expect(parseMinuteOfDay('23:59')).toBe(1439);
        expect(formatMinuteOfDay(600)).toBe('10:00');
        expect(formatMinuteOfDay(570)).toBe('09:30');
    });

    it('rejects nonsense rather than coercing it', () => {
        expect(parseMinuteOfDay('24:00')).toBeNull();
        expect(parseMinuteOfDay('10:60')).toBeNull();
        expect(parseMinuteOfDay('1000')).toBeNull();
        expect(parseMinuteOfDay('')).toBeNull();
    });

    it('places a wall-clock time on an IST day', () => {
        const sunday = istStartOfDay(ist('2026-09-20T12:00:00'));
        expect(istTimeOnDay(sunday, 600).toISOString()).toBe('2026-09-20T04:30:00.000Z');
    });

    it('rolls a past-midnight end time into the next day', () => {
        const sunday = istStartOfDay(ist('2026-09-20T12:00:00'));
        // 23:00 start, 01:00 end → the end is minute 1500, not minute 60.
        expect(istTimeOnDay(sunday, 1500).toISOString()).toBe('2026-09-20T19:30:00.000Z');
    });
});
