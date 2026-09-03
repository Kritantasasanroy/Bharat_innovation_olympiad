/**
 * The slot-search rule, as pure functions.
 *
 * The policy in one sentence: **a student registering today sits on the first
 * Sunday at least two weeks from now that still has a seat; if every Sunday
 * inside eight weeks is full, the same search runs again over Saturdays.**
 *
 * Everything here is deliberately I/O-free so the calendar arithmetic — which
 * is where this kind of rule always goes wrong — can be tested exhaustively
 * without a database. `SlotAssignmentService` does the reading and writing; this
 * file only decides *which dates to try, in what order*.
 *
 * ## Why IST, explicitly
 *
 * "Sunday" is a claim about a wall clock in India, not about UTC. A sitting at
 * 10:00 IST on Sunday the 21st is 04:30 UTC on the 21st, but one at 02:00 IST
 * on Sunday is 20:30 UTC on *Saturday the 20th* — so deriving the weekday from
 * a UTC instant silently picks the wrong day for early-morning slots, and
 * `new Date().getDay()` on the server picks whatever day the host's timezone
 * says (Render runs UTC; a developer's laptop does not). Both bugs are invisible
 * in testing and wrong in production, so every date here is computed against a
 * fixed +05:30 offset and never against the host clock.
 *
 * India does not observe DST, so a fixed offset is correct year-round rather
 * than merely convenient.
 */

/** Asia/Kolkata is UTC+05:30, year-round — no daylight saving to track. */
export const IST_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const;

export function weekdayName(day: number): string {
    return WEEKDAY_NAMES[((day % 7) + 7) % 7];
}

/**
 * Midnight IST of the calendar day an instant falls on, as a UTC instant.
 *
 * This is the canonical form every date in the slot system is reduced to:
 * `ExamSlot.slotDate` holds it, and two dates are the same day iff these match.
 */
export function istStartOfDay(instant: Date): Date {
    const shifted = instant.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE;
    const floored = Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY;
    return new Date(floored - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** The IST weekday of an instant. 0 = Sunday. */
export function istWeekday(instant: Date): Weekday {
    const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
    return shifted.getUTCDay() as Weekday;
}

/** `n` whole days after an IST midnight, staying on an IST midnight. */
export function addDays(istMidnight: Date, days: number): Date {
    return new Date(istMidnight.getTime() + days * MS_PER_DAY);
}

/**
 * A wall-clock time on a given IST day, as a UTC instant.
 *
 * `minuteOfDay` is minutes from IST midnight, so 600 → 10:00 IST. Values at or
 * beyond 1440 roll into the following day, which is what lets a sitting be
 * configured to end after midnight.
 */
export function istTimeOnDay(istMidnight: Date, minuteOfDay: number): Date {
    return new Date(istMidnight.getTime() + minuteOfDay * MS_PER_MINUTE);
}

/**
 * The real start/end instants of a sitting on a given IST day.
 *
 * An `endMinute` at or before the start means the sitting runs past midnight, so
 * it lands on the following IST day — the one case where a naive
 * `start + duration` on the same date silently produces a sitting that ends
 * before it begins.
 */
export function slotWindow(
    istMidnight: Date,
    startMinute: number,
    endMinute: number,
): { startsAt: Date; endsAt: Date } {
    const wrappedEnd = endMinute > startMinute ? endMinute : endMinute + 1440;
    return {
        startsAt: istTimeOnDay(istMidnight, startMinute),
        endsAt: istTimeOnDay(istMidnight, wrappedEnd),
    };
}

/** `HH:mm` for a minutes-from-IST-midnight value, for labels and admin forms. */
export function formatMinuteOfDay(minuteOfDay: number): string {
    const wrapped = ((minuteOfDay % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parses `HH:mm` into minutes from midnight. Returns null if unparseable. */
export function parseMinuteOfDay(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
}

export interface SearchRules {
    /** When the student registered. Day 0 of the search. */
    registeredAt: Date;
    /** No sitting sooner than this many days after registration. */
    leadDays: number;
    /** No sitting later than this many days after registration. */
    horizonDays: number;
    /**
     * Weekdays to try, in order of preference. Every occurrence of the first
     * entry is exhausted before the second is looked at.
     */
    dayPreference: number[];
}

export interface CandidateDate {
    /** Midnight IST of the day to try, as a UTC instant. */
    date: Date;
    weekday: Weekday;
    /** Where this day sat in `dayPreference`. 0 = the most-preferred weekday. */
    preferenceRank: number;
    /** Days after registration, for diagnostics and admin explanations. */
    daysFromRegistration: number;
}

/**
 * Every date the assigner may use, already in the order it must try them.
 *
 * The ordering is the whole rule, so it is worth stating exactly: this is
 * **preference-major**. All Sundays in the window come first, earliest to
 * latest; only once every one of them has been rejected does the first Saturday
 * get a look. That is what "if all full then move to the next sunday … till 8
 * weeks … if still no slot found, come to the 1st saturday" asks for, and it is
 * meaningfully different from ordering by date — which would offer a student the
 * Saturday *before* a Sunday they could still have had.
 *
 * The window is inclusive at both ends: registration + `leadDays` is allowed (a
 * student registering on a Sunday may sit exactly a fortnight later), and so is
 * registration + `horizonDays`.
 *
 * Returns an empty list, rather than throwing, when the rules are unsatisfiable
 * (an empty preference list, or a horizon before the lead). "Nowhere to put this
 * student" is a real state the caller has to report to an admin either way, so
 * it is not exceptional.
 */
export function candidateDates(rules: SearchRules): CandidateDate[] {
    const { registeredAt, leadDays, horizonDays, dayPreference } = rules;
    if (dayPreference.length === 0 || horizonDays < leadDays) return [];

    const registrationDay = istStartOfDay(registeredAt);
    const earliest = addDays(registrationDay, leadDays);
    const latest = addDays(registrationDay, horizonDays);

    const out: CandidateDate[] = [];
    const seen = new Set<number>();

    dayPreference.forEach((preferred, preferenceRank) => {
        const target = ((preferred % 7) + 7) % 7;
        // Walk forward from `earliest` to the first occurrence of this weekday,
        // then stride a week at a time.
        const offset = (target - istWeekday(earliest) + 7) % 7;
        for (let date = addDays(earliest, offset); date <= latest; date = addDays(date, 7)) {
            // A weekday listed twice in the preference order must not produce
            // the same date twice — the second pass would look like a genuine
            // second chance at a slot that has already been rejected.
            if (seen.has(date.getTime())) continue;
            seen.add(date.getTime());
            out.push({
                date,
                weekday: target as Weekday,
                preferenceRank,
                daysFromRegistration: Math.round(
                    (date.getTime() - registrationDay.getTime()) / MS_PER_DAY,
                ),
            });
        }
    });

    return out;
}

/**
 * Why a student ended up without a sitting. Returned to the admin UI verbatim,
 * because "not assigned" on its own is unactionable — an admin needs to know
 * whether to add a timing, add seats, or widen the window.
 */
export type UnassignedReason =
    /** The instance has no active timing covering any preferred weekday. */
    | 'NO_TIMINGS'
    /** Timings exist, but every sitting in the window was full. */
    | 'ALL_FULL'
    /** The search window falls entirely outside the exam instance's own window. */
    | 'OUTSIDE_EXAM_WINDOW'
    /** The rules themselves produce no dates at all. */
    | 'NO_CANDIDATE_DATES';

export function unassignedMessage(reason: UnassignedReason, rules: SearchRules): string {
    const days = `${rules.leadDays}–${rules.horizonDays} days after registration`;
    const prefs = rules.dayPreference.map(weekdayName).join(', then ');
    switch (reason) {
        case 'NO_TIMINGS':
            return `No active slot timing runs on ${prefs}. Add a timing for one of those days.`;
        case 'ALL_FULL':
            return `Every sitting on ${prefs} within ${days} is full. Add seats or another timing.`;
        case 'OUTSIDE_EXAM_WINDOW':
            return `The ${days} window falls outside this exam's own dates. Extend the exam window, or shorten the lead time.`;
        case 'NO_CANDIDATE_DATES':
            return 'The assignment rules produce no eligible dates. Check the lead time, horizon and preferred days.';
    }
}
