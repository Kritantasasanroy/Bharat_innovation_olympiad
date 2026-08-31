import { describe, expect, it } from 'vitest';
import {
    autoSubmitCopy,
    isAttemptAlreadyFinished,
    submitErrorMessage,
    violationConsequence,
    violationCopy,
    type AutoSubmitCause,
    type ViolationKind,
} from './examIntegrity';

/** Shapes an axios-style rejection the way `api` actually produces one. */
const httpError = (status: number, message?: string) => ({
    message: `Request failed with status code ${status}`,
    response: { status, data: message === undefined ? {} : { message } },
});

const ALL_KINDS: ViolationKind[] = [
    'exit_fullscreen',
    'tab_switch',
    'window_blur',
    'no_face',
    'looking_away',
    'face_mismatch',
    'multiple_faces',
    'screen_capture',
];

/**
 * The only two ways a paper ends by itself.
 *
 * `max_violations` and `navigation` were removed deliberately: violations are a
 * record for the reviewer and a reload is logged but survivable, so neither
 * submits an exam. This list is the contract — a cause reappearing here means
 * something has started ending papers again.
 */
const ALL_CAUSES: AutoSubmitCause[] = [
    'time_up',
    'paused_too_long',
];

describe('violationCopy', () => {
    it('names, explains and gives a fix for every violation kind', () => {
        for (const kind of ALL_KINDS) {
            const copy = violationCopy(kind);
            expect(copy.title, kind).toBeTruthy();
            expect(copy.what, kind).toBeTruthy();
            expect(copy.fix, kind).toBeTruthy();
            // The generic fallback means a kind was added without copy — which
            // would put "An exam integrity rule was broken" on screen instead of
            // the rule's actual name.
            expect(copy.title, kind).not.toBe('Exam rule broken');
        }
    });

    it('falls back rather than throwing on an unknown kind', () => {
        expect(violationCopy('nonsense' as ViolationKind).title).toBe('Exam code violation');
    });
});

describe('violationConsequence', () => {
    // The whole point of the rewrite: violations no longer end anything, so the
    // copy must never imply a countdown to the paper being taken away.
    it('never threatens the student with the exam ending', () => {
        for (const count of [1, 2, 3, 4, 10]) {
            const text = violationConsequence(count, 3).toLowerCase();
            expect(text, `count ${count}`).not.toContain('one more');
            expect(text, `count ${count}`).not.toContain('submitted automatically');
            expect(text, `count ${count}`).not.toContain('final violation');
        }
    });

    it('states the running count', () => {
        expect(violationConsequence(1, 3)).toContain('1 violation');
        expect(violationConsequence(2, 3)).toContain('2 violations');
    });

    it('reassures below the review threshold', () => {
        expect(violationConsequence(1, 3)).toContain('keep going');
    });

    it('says a person will review once the threshold is reached', () => {
        expect(violationConsequence(3, 3)).toContain('review');
    });

    // Two violations can land in the same tick, so the count can overshoot the
    // threshold; that must still read as "under review", not fall through to
    // the reassuring branch.
    it('treats an overshoot as reviewed', () => {
        expect(violationConsequence(5, 3)).toContain('review');
    });
});

describe('isAttemptAlreadyFinished', () => {
    // The exact strings AttemptService throws. A student whose clock ran out
    // hits the first one; a second auto-submit landing after the first hits it
    // too. Neither is a failure — the paper is scored and stored.
    it('recognises a submit refused because the attempt is over', () => {
        expect(isAttemptAlreadyFinished(httpError(400, 'Attempt is not active'))).toBe(true);
        expect(isAttemptAlreadyFinished(httpError(400, 'You have already completed this exam'))).toBe(true);
    });

    it('does not swallow a genuine failure', () => {
        expect(isAttemptAlreadyFinished(httpError(400, 'Answer is malformed'))).toBe(false);
        expect(isAttemptAlreadyFinished(httpError(401, 'Unauthorized'))).toBe(false);
        expect(isAttemptAlreadyFinished(httpError(500, 'Internal server error'))).toBe(false);
        expect(isAttemptAlreadyFinished(new Error('Network Error'))).toBe(false);
        expect(isAttemptAlreadyFinished(undefined)).toBe(false);
    });

    // A 500 that happens to mention the phrase is still a real outage; the
    // status check is what keeps this from hiding one.
    it('requires the status, not just the wording', () => {
        expect(isAttemptAlreadyFinished(httpError(500, 'Attempt is not active'))).toBe(false);
    });
});

describe('submitErrorMessage', () => {
    it('prefers the server message over the axios boilerplate', () => {
        expect(submitErrorMessage(httpError(400, 'Attempt is not active')))
            .toBe('Attempt is not active');
    });

    it('falls back to the error message, then to something readable', () => {
        expect(submitErrorMessage(new Error('Network Error'))).toBe('Network Error');
        expect(submitErrorMessage({})).toBe('Could not reach the server.');
    });
});

describe('autoSubmitCopy', () => {
    it('gives a title, a reason and a detail for every cause', () => {
        for (const cause of ALL_CAUSES) {
            const copy = autoSubmitCopy(cause);
            expect(copy.title, cause).toBeTruthy();
            expect(copy.reason, cause).toBeTruthy();
            expect(copy.detail, cause).toBeTruthy();
        }
    });

    // Which of the three pause causes started the countdown changes what the
    // student should do differently. Telling someone who alt-tabbed to a
    // notification about a fullscreen rule they never broke is worse than
    // saying nothing.
    it('names the specific thing that paused the exam', () => {
        expect(autoSubmitCopy('paused_too_long', { violation: 'tab_switch' }).reason)
            .toContain('another tab');
        expect(autoSubmitCopy('paused_too_long', { violation: 'window_blur' }).reason)
            .toContain('another window');
        expect(autoSubmitCopy('paused_too_long', { violation: 'exit_fullscreen' }).reason)
            .toContain('fullscreen');
    });

    it('falls back to the fullscreen wording when the cause is not known', () => {
        expect(autoSubmitCopy('paused_too_long').reason).toContain('fullscreen');
    });

    it('uses the configured pause timeout rather than a hard-coded one', () => {
        expect(autoSubmitCopy('paused_too_long', { pauseSeconds: 45 }).reason).toContain('45');
    });

    // Every auto-submit must reassure the student their saved answers counted —
    // this is the single most common thing they panic about.
    it('confirms saved answers were counted, whatever the cause', () => {
        for (const cause of ALL_CAUSES) {
            expect(autoSubmitCopy(cause).detail.toLowerCase(), cause).toContain('saved');
        }
    });
});
