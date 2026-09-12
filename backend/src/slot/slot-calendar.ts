/**
 * The season's exam calendar, as data.
 *
 * Sittings used to be derived from weekday rules ("the first Sunday at least a
 * fortnight out"). They are now an explicit, published list of dates: the
 * Sundays and Saturdays the exam actually runs, in the order they are to be
 * filled. That is a better fit for how the season is actually run — the dates
 * are announced to schools up front, and two of them (Diwali) are deliberately
 * absent rather than merely unlucky.
 *
 * ## Priority
 *
 * A date carries a **priority tier**, and the assigner exhausts tier 1 before it
 * looks at tier 2. Tier 1 is the Sundays, which run the full seven sittings a
 * day; tier 2 is the Saturdays before them, which run only the two evening
 * sittings and exist as overflow. A timing carries the same number, so a
 * Saturday never accidentally opens the 08:30 sitting.
 *
 * ## Why this lives in code as well as in the database
 *
 * The rows in `ExamScheduleDate` are the truth an admin edits. This constant is
 * the **seed** behind the "Load the standard calendar" button and the source of
 * the time dropdown, so that setting up a new exam is one click rather than
 * seventy-two, and so the times an admin can pick are exactly the times the
 * season publishes. Editing an instance's dates afterwards is expected; editing
 * this file changes only what a *new* instance starts from.
 */

/** Priority tier of a sitting date. 1 is filled before 2. */
export const PRIORITY_ONE = 1;
export const PRIORITY_TWO = 2;

/** One selectable start time, as minutes from IST midnight. */
export interface CalendarTime {
    /** `HH:mm`, 24-hour IST — the value the admin dropdown submits. */
    readonly value: string;
    /** How it is written in the published schedule, e.g. `8.30 AM`. */
    readonly label: string;
    /** Which tiers offer this time. Tier 2 runs only the two evening sittings. */
    readonly priorities: readonly number[];
}

/**
 * The seven sitting times, 90 minutes apart.
 *
 * The gap is the reason a sitting defaults to 90 minutes and why the overlap
 * check exists: a 120-minute paper at 10:00 would run into the 11:30 sitting,
 * and the two would then be competing for the same invigilation.
 */
export const CALENDAR_TIMES: readonly CalendarTime[] = [
    { value: '08:30', label: '8.30 AM', priorities: [PRIORITY_ONE] },
    { value: '10:00', label: '10.00 AM', priorities: [PRIORITY_ONE] },
    { value: '11:30', label: '11.30 AM', priorities: [PRIORITY_ONE] },
    { value: '13:00', label: '1.00 PM', priorities: [PRIORITY_ONE] },
    { value: '14:30', label: '2.30 PM', priorities: [PRIORITY_ONE] },
    { value: '16:00', label: '4.00 PM', priorities: [PRIORITY_ONE, PRIORITY_TWO] },
    { value: '17:30', label: '5.30 PM', priorities: [PRIORITY_ONE, PRIORITY_TWO] },
] as const;

/** Minutes a sitting runs for unless an admin shortens it. */
export const DEFAULT_SITTING_MINUTES = 90;

/** Seats per sitting, unless an admin raises them on the day. */
export const DEFAULT_SITTING_CAPACITY = 50;

export interface CalendarDate {
    /** `YYYY-MM-DD`, the IST calendar day. */
    readonly date: string;
    readonly priority: number;
    /**
     * A day the exam deliberately does *not* run. Kept as a row rather than
     * omitted so the blackout is visible on the admin calendar with its reason,
     * instead of looking like a date somebody forgot to add.
     */
    readonly isActive?: boolean;
    readonly note?: string;
}

/**
 * The 2026 season.
 *
 * Tier 1 — eight Sundays × seven sittings × 50 seats = **2,800 places**.
 * Tier 2 — eight Saturdays × two sittings × 50 seats = **800 places**.
 *
 * 7–9 November are blacked out for Diwali, which is why the Sundays jump from
 * 1 November to 15 November and the Saturdays from 31 October to 14 November.
 *
 * Note on 21 November: the published list names "23 Nov" as the last tier-2
 * date, but 23 November 2026 is a Monday and every other tier-2 date is the
 * Saturday immediately before a tier-1 Sunday. It is recorded here as Saturday
 * 21 November, pairing with Sunday the 22nd like the other seven.
 */
export const BIO_2026_CALENDAR: readonly CalendarDate[] = [
    // ── Tier 1 — Sundays, all seven sittings ────────────────────────────────
    { date: '2026-09-27', priority: PRIORITY_ONE },
    { date: '2026-10-04', priority: PRIORITY_ONE },
    { date: '2026-10-11', priority: PRIORITY_ONE },
    { date: '2026-10-18', priority: PRIORITY_ONE },
    { date: '2026-10-25', priority: PRIORITY_ONE },
    { date: '2026-11-01', priority: PRIORITY_ONE },
    { date: '2026-11-15', priority: PRIORITY_ONE },
    { date: '2026-11-22', priority: PRIORITY_ONE },

    // ── Tier 2 — the Saturday before each, evening sittings only ────────────
    { date: '2026-09-26', priority: PRIORITY_TWO },
    { date: '2026-10-03', priority: PRIORITY_TWO },
    { date: '2026-10-10', priority: PRIORITY_TWO },
    { date: '2026-10-17', priority: PRIORITY_TWO },
    { date: '2026-10-24', priority: PRIORITY_TWO },
    { date: '2026-10-31', priority: PRIORITY_TWO },
    { date: '2026-11-14', priority: PRIORITY_TWO },
    { date: '2026-11-21', priority: PRIORITY_TWO },

    // ── Diwali — no sittings ────────────────────────────────────────────────
    { date: '2026-11-08', priority: PRIORITY_ONE, isActive: false, note: 'Diwali — no sittings' },
    { date: '2026-11-09', priority: PRIORITY_ONE, isActive: false, note: 'Diwali — no sittings' },
] as const;

/** The times tier `priority` runs, in the order the assigner tries them. */
export function timesForPriority(priority: number): CalendarTime[] {
    return CALENDAR_TIMES.filter((t) => t.priorities.includes(priority));
}

/** The label the season publishes for an `HH:mm` value, or the value itself. */
export function calendarTimeLabel(value: string): string {
    return CALENDAR_TIMES.find((t) => t.value === value)?.label ?? value;
}
