import { describe, expect, it } from 'vitest';
import {
    FINAL_WARNING_MINUTES,
    MASCOT,
    MASCOT_CUES,
    MASCOT_CUE_FRACTIONS,
    cueIsWorthShowing,
    nextMascotCue,
} from './mascot';

/**
 * The in-exam timer-check schedule.
 *
 * This is pure on purpose: the exam player re-renders many times a second, so
 * "is a message due?" must be idempotent. The tests that matter are the
 * double-fire and the backgrounded-tab ones — both are bugs a student would
 * experience as either a nagging popup or a message they never got — plus the
 * ones covering the last three minutes, where a missed message costs marks.
 */
describe('nextMascotCue', () => {
    const none = new Set<string>();
    const HOUR = 60 * 60; // a 60-minute paper, in seconds
    const min = (m: number) => m * 60;

    it('is silent before the first check', () => {
        expect(nextMascotCue(0, HOUR, none)).toBeNull();
        expect(nextMascotCue(min(17.9), HOUR, none)).toBeNull();
    });

    it('fires the 30% check exactly on the mark', () => {
        // 30% of 60 minutes is 18.
        expect(nextMascotCue(min(18), HOUR, none)?.id).toBe('pct-30');
    });

    it('scales with the paper rather than assuming an hour', () => {
        // The bug this replaces: fixed 20/40-minute marks meant a 90-minute
        // paper went quiet for its last fifty minutes.
        const long = 90 * 60;
        expect(nextMascotCue(min(26), long, none)).toBeNull();
        expect(nextMascotCue(min(27), long, none)?.id).toBe('pct-30');
        expect(nextMascotCue(min(54), long, new Set(['pct-30']))?.id).toBe('pct-60');
        expect(nextMascotCue(min(81), long, new Set(['pct-30', 'pct-60']))?.id).toBe('pct-90');
    });

    it('never fires the same cue twice', () => {
        // The player asks on every tick; without this the toast would reappear
        // continuously for the next eighteen minutes.
        expect(nextMascotCue(min(25), HOUR, new Set(['pct-30']))).toBeNull();
    });

    it('still delivers a check whose moment passed while the tab was backgrounded', () => {
        // A student who switched away at minute 17 and returned at minute 25 has
        // not had the 30% message; it is still owed, not skipped.
        expect(nextMascotCue(min(25), HOUR, none)?.id).toBe('pct-30');
    });

    it('returns only one cue at a time, even when several are due', () => {
        // Two toasts at once would stack and cover the paper.
        expect(nextMascotCue(min(50), HOUR, none)?.id).toBe('pct-30');
    });

    it('goes quiet once every cue has fired', () => {
        const fired = new Set(MASCOT_CUES.map((c) => c.id));
        expect(nextMascotCue(min(59), HOUR, fired)).toBeNull();
    });

    it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY]])(
        'returns null for a nonsense elapsed time (%s)',
        (elapsed) => {
            // `remaining` briefly misbehaves around socket reconnects; a garbage
            // value must not fire a message rather than crash the player.
            expect(nextMascotCue(elapsed as number, HOUR, none)).toBeNull();
        },
    );

    it.each([[0], [-1], [Number.NaN]])(
        'returns null when the duration is unusable (%s)',
        (duration) => {
            // A fraction of an unknown duration is meaningless. Better silent
            // than firing every cue at once on the first tick.
            expect(nextMascotCue(min(10), duration as number, none)).toBeNull();
        },
    );
});

describe('the last-three-minutes warning', () => {
    const none = new Set<string>();
    const HOUR = 60 * 60;
    const min = (m: number) => m * 60;

    it('fires exactly at three minutes remaining, not before', () => {
        expect(nextMascotCue(min(56.9), HOUR, new Set(['pct-30', 'pct-60', 'pct-90']))).toBeNull();
        expect(nextMascotCue(min(57), HOUR, new Set(['pct-30', 'pct-60', 'pct-90']))?.id).toBe(
            'final-warning',
        );
    });

    it('is carried as a warning, not as encouragement', () => {
        const cue = nextMascotCue(min(58), HOUR, new Set(['pct-30', 'pct-60', 'pct-90']));
        expect(cue?.tone).toBe('warning');
    });

    it('takes priority over an unfired timer check', () => {
        // A student returning to a backgrounded tab with two minutes left needs
        // "finish up" now, not a 30% pep talk from forty minutes ago.
        expect(nextMascotCue(min(58), HOUR, none)?.id).toBe('final-warning');
    });

    it('goes quiet entirely once the clock has run out', () => {
        // The player is already auto-submitting. Neither "3 minutes left" nor a
        // 30% check the student never saw belongs over a closing paper — and
        // `remaining` overshooting slightly past zero is normal around the
        // final ticks, so the check has to hold past the boundary too.
        expect(nextMascotCue(HOUR, HOUR, none)).toBeNull();
        expect(nextMascotCue(HOUR + 30, HOUR, none)).toBeNull();
    });

    it('does not fire twice', () => {
        expect(nextMascotCue(min(58), HOUR, new Set(['final-warning']))?.id).toBe('pct-30');
    });

    it('still fires on a paper too short for any percentage check', () => {
        // A 5-minute trial gets no pep talks (they would all land inside the
        // warning window) but must still be told the clock is nearly up.
        const short = 5 * 60;
        expect(nextMascotCue(min(2), short, new Set())?.id).toBe('final-warning');
    });
});

describe('cueIsWorthShowing', () => {
    const cue30 = MASCOT_CUES[0];
    const cue90 = MASCOT_CUES[2];
    const warning = MASCOT_CUES[3];

    it('shows every timer check on an hour-long paper', () => {
        expect(cueIsWorthShowing(cue30, 60)).toBe(true);
        expect(cueIsWorthShowing(cue90, 60)).toBe(true);
    });

    it('suppresses a check that would collide with the three-minute warning', () => {
        // 90% of a 20-minute paper is minute 18 — two minutes left. "Final
        // stretch, go back to what you skipped" and "3 minutes left, finish up"
        // a minute apart say the same thing twice, and the second undoes the
        // first's calm.
        expect(cueIsWorthShowing(cue90, 20)).toBe(false);
        expect(cueIsWorthShowing(cue30, 4)).toBe(false);
    });

    it('allows a check that clears the warning window', () => {
        // 90% of a 40-minute paper leaves 4 minutes — outside the 3-minute window.
        expect(cueIsWorthShowing(cue90, 40)).toBe(true);
    });

    it('never suppresses the warning itself', () => {
        expect(cueIsWorthShowing(warning, 5)).toBe(true);
        expect(cueIsWorthShowing(warning, 0)).toBe(true);
    });

    it('does not suppress when the duration is unknown', () => {
        // An unknown duration must not silence encouragement altogether.
        expect(cueIsWorthShowing(cue30, 0)).toBe(true);
        expect(cueIsWorthShowing(cue30, Number.NaN)).toBe(true);
    });
});

describe('the cue schedule', () => {
    it('checks in every 30% of the way through', () => {
        expect(MASCOT_CUE_FRACTIONS).toEqual([0.3, 0.6, 0.9]);
    });

    it('emits a cue per fraction plus the warning, each with real copy', () => {
        expect(MASCOT_CUES.map((c) => c.id)).toEqual([
            'pct-30',
            'pct-60',
            'pct-90',
            'final-warning',
        ]);
        for (const cue of MASCOT_CUES) {
            expect(cue.encouragement.length).toBeGreaterThan(10);
            expect(cue.title.length).toBeGreaterThan(0);
        }
    });

    it('names the warning after the window it actually uses', () => {
        // A copy change to "5 minutes left" without moving the constant would
        // be a message that lies about the clock.
        const warning = MASCOT_CUES.find((c) => c.id === 'final-warning')!;
        expect(warning.title).toContain(String(FINAL_WARNING_MINUTES));
    });
});

describe('MASCOT identity', () => {
    it('is defined in exactly one place so a rename is one edit', () => {
        expect(MASCOT.name).toBeTruthy();
        expect(MASCOT.avatar).toBeTruthy();
        expect(MASCOT.watchingLine).toBeTruthy();
    });

    // He is one character across registration, the portal, the trial paper and
    // the in-exam proctoring messages. A line that refers to him generically
    // ("our smart invigilator") breaks that, and it is the in-exam messages
    // where it matters most — that is where a student needs a familiar name
    // rather than an anonymous system voice.
    it('speaks in Limon’s name rather than a generic role', () => {
        expect(MASCOT.name).toBe('Limon');
        expect(MASCOT.watchingLine).toContain(MASCOT.name);
    });
});
