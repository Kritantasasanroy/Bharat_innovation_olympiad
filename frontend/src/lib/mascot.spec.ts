import { describe, expect, it } from 'vitest';
import {
    cueIsWorthShowing,
    MASCOT,
    MASCOT_CUES,
    MASCOT_CUE_MINUTES,
    MIN_REMAINING_MINUTES_FOR_CUE,
    nextMascotCue,
} from './mascot';

/**
 * The in-exam encouragement schedule.
 *
 * This is pure on purpose: the exam player re-renders many times a second, so
 * "is a message due?" must be idempotent. The tests that matter are the
 * double-fire and the backgrounded-tab ones — both are bugs a student would
 * experience as either a nagging popup or a message they never got.
 */
describe('nextMascotCue', () => {
    const none = new Set<string>();
    const min = (m: number) => m * 60;

    it('is silent before the first cue', () => {
        expect(nextMascotCue(min(0), none)).toBeNull();
        expect(nextMascotCue(min(19.9), none)).toBeNull();
    });

    it('fires the 20-minute cue exactly on the mark', () => {
        expect(nextMascotCue(min(20), none)?.id).toBe('min-20');
    });

    it('never fires the same cue twice', () => {
        const fired = new Set(['min-20']);
        // The player asks on every tick; without this the toast would reappear
        // continuously for the next twenty minutes.
        expect(nextMascotCue(min(25), fired)).toBeNull();
    });

    it('still delivers a cue whose moment passed while the tab was backgrounded', () => {
        // A student who switched away at minute 18 and returned at minute 31 has
        // not had the 20-minute message; it is still owed, not skipped.
        expect(nextMascotCue(min(31), none)?.id).toBe('min-20');
    });

    it('moves on to the 40-minute cue once the first is done', () => {
        const fired = new Set(['min-20']);
        expect(nextMascotCue(min(39), fired)).toBeNull();
        expect(nextMascotCue(min(40), fired)?.id).toBe('min-40');
    });

    it('returns only one cue at a time, even when both are due', () => {
        // Two toasts at once would stack and cover the paper.
        const cue = nextMascotCue(min(90), none);
        expect(cue?.id).toBe('min-20');
    });

    it('goes quiet once every cue has fired', () => {
        const fired = new Set(MASCOT_CUES.map((c) => c.id));
        expect(nextMascotCue(min(120), fired)).toBeNull();
    });

    it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY]])(
        'returns null for a nonsense elapsed time (%s)',
        (elapsed) => {
            // `remaining` briefly misbehaves around socket reconnects; a garbage
            // value must not fire a message rather than crash the player.
            expect(nextMascotCue(elapsed as number, none)).toBeNull();
        },
    );

    it('emits a cue for every configured minute mark', () => {
        expect(MASCOT_CUES.map((c) => c.atMinute)).toEqual([...MASCOT_CUE_MINUTES]);
        for (const cue of MASCOT_CUES) expect(cue.encouragement.length).toBeGreaterThan(10);
    });
});

describe('cueIsWorthShowing', () => {
    const cue20 = MASCOT_CUES[0];
    const cue40 = MASCOT_CUES[1];

    it('shows a 20-minute cue on an hour-long paper', () => {
        expect(cueIsWorthShowing(cue20, 60)).toBe(true);
    });

    it('suppresses a cue that would land too near the end', () => {
        // "Plenty of time left" with four minutes to go is worse than silence.
        expect(cueIsWorthShowing(cue20, 22)).toBe(false);
        expect(cueIsWorthShowing(cue40, 42)).toBe(false);
    });

    it('allows a cue exactly at the minimum remaining margin', () => {
        expect(cueIsWorthShowing(cue20, 20 + MIN_REMAINING_MINUTES_FOR_CUE)).toBe(true);
    });

    it('does not suppress when the duration is unknown', () => {
        // An unknown duration must not silence encouragement altogether.
        expect(cueIsWorthShowing(cue20, 0)).toBe(true);
        expect(cueIsWorthShowing(cue20, Number.NaN)).toBe(true);
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
