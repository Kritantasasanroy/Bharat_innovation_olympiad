/**
 * The words the exam player uses when it interrupts a student.
 *
 * Every integrity event — a violation, a lockdown breach, an auto-submit — has
 * to answer three questions on screen, in this order:
 *
 *   1. **What happened?**  A title naming the rule, not a code.
 *   2. **Why did it happen?**  What the system actually observed, so a student
 *      who did nothing wrong (a flaky camera, a notification stealing focus)
 *      can tell what to change.
 *   3. **What happens now?**  How many strikes are left, or where they are
 *      being sent.
 *
 * Keeping the copy here rather than inline in the player means the violation
 * banner, the fullscreen gate and the auto-submit notice can never disagree
 * about what a given event is called — they previously did, which is how a
 * student could see "Violation 2 of 3" in one place and no explanation at all
 * anywhere else.
 */

import { EXAM_PAUSE_TIMEOUT_SEC } from '@/lib/constants';

export type ViolationKind =
    | 'exit_fullscreen'
    | 'tab_switch'
    | 'window_blur'
    | 'no_face'
    | 'looking_away'
    | 'face_mismatch'
    | 'multiple_faces'
    | 'screen_capture';

export interface ViolationCopy {
    icon: string;
    /** Names the rule that was broken. */
    title: string;
    /** What the system observed. */
    what: string;
    /** What the student should do differently. */
    fix: string;
}

const VIOLATION_COPY: Record<ViolationKind, ViolationCopy> = {
    exit_fullscreen: {
        icon: '🖥️',
        title: 'You left fullscreen',
        what: 'The exam window stopped being fullscreen, usually the Escape key, F11, or the Windows/Command key.',
        fix: 'Return to fullscreen and stay there until you submit.',
    },
    tab_switch: {
        icon: '🔀',
        title: 'You switched away from the exam',
        what: 'This browser tab was hidden, which happens when another tab, window or app comes to the front.',
        fix: 'Keep only the exam on screen. Close other tabs and apps before continuing.',
    },
    window_blur: {
        icon: '↪️',
        title: 'The exam window lost focus',
        what: 'Something outside the exam took focus: another window, a notification, or a second screen.',
        fix: 'Click back into the exam and silence notifications on your device.',
    },
    no_face: {
        icon: '👤',
        title: 'Your face was not visible',
        what: 'The camera could not find your face for several seconds in a row.',
        fix: 'Sit squarely in front of the camera with your face lit and unobstructed.',
    },
    looking_away: {
        icon: '👀',
        title: 'You were looking away from the screen',
        what: 'The camera saw your face turned away from the screen for several seconds in a row.',
        fix: 'Keep your eyes on the exam. Look up only briefly if you must.',
    },
    face_mismatch: {
        icon: '⚠️',
        title: 'The face on camera did not match your profile',
        what: 'The face in frame did not match the photo you enrolled when you registered.',
        fix: 'Only the registered ward may sit this paper. Make sure it is you in frame, well lit.',
    },
    multiple_faces: {
        icon: '👥',
        title: 'More than one person was on camera',
        what: 'The camera saw more than one face in the frame.',
        fix: 'Sit alone. Ask anyone else in the room to move out of the camera view.',
    },
    screen_capture: {
        icon: '📷',
        title: 'Screen capture attempt',
        what: 'A screenshot or print command was detected. Exam questions may not be copied, photographed or printed.',
        fix: 'Do not press Print Screen, Ctrl+P, or use any capture tool during the exam.',
    },
};

export function violationCopy(kind: ViolationKind): ViolationCopy {
    return VIOLATION_COPY[kind] ?? {
        icon: '⚠️',
        title: 'Exam rule broken',
        what: 'An exam integrity rule was broken.',
        fix: 'Follow the on-screen instructions and keep the exam in fullscreen.',
    };
}

/**
 * The consequence line — what this violation actually means for the student.
 *
 * It used to count down lives ("one more and your exam will be submitted"),
 * because violations used to end the paper. They no longer do: the only things
 * that end an exam are the clock running out and staying away from the paper
 * past the pause timeout. So this says the true thing instead, which is both
 * less frightening and more useful — the count is a record that a person reads,
 * not a fuse.
 *
 * Past {@link VIOLATION_REVIEW_THRESHOLD} the attempt is flagged for review, and
 * the student is told so plainly rather than discovering it weeks later.
 */
export function violationConsequence(count: number, threshold: number): string {
    const noun = count === 1 ? 'violation' : 'violations';
    if (count >= threshold) {
        return `That is ${count} ${noun} recorded on this paper. Your exam has not been stopped and you can carry on, but it has passed the point where a person will review what was recorded before your result is confirmed.`;
    }
    return `That is ${count} ${noun} recorded on this paper. Nothing has been taken away, keep going. Violations are only a record, and a person reads them before anything is concluded.`;
}

// ── Submission errors ───────────────────────────────────────────────────────

/** The server's message, not axios's "Request failed with status code 400". */
export function submitErrorMessage(err: unknown): string {
    const res = (err as any)?.response;
    return res?.data?.message || (err as Error)?.message || 'Could not reach the server.';
}

/**
 * Was this submit refused because the attempt is already over?
 *
 * `AttemptService.submitAttempt` throws `BadRequestException('Attempt is not
 * active')` for anything no longer IN_PROGRESS, and `startAttempt` throws 'You
 * have already completed this exam'. Both mean the paper is closed and scored —
 * a success wearing a 400. Showing the student "Could not submit automatically —
 * Request failed with status code 400" was alarming and simply untrue, and left
 * them pressing Submit against a paper that had already been submitted.
 *
 * The status check matters as much as the message: a 500 whose body happens to
 * mention "not active" is a real failure and must not be swallowed.
 */
export function isAttemptAlreadyFinished(err: unknown): boolean {
    const res = (err as any)?.response;
    if (res?.status !== 400) return false;
    const message = String(res?.data?.message ?? '');
    return /not active|already (been )?(completed|submitted)/i.test(message);
}

// ── Auto-submit ─────────────────────────────────────────────────────────────

/**
 * The only two ways an exam ends without the student pressing Submit.
 *
 * `max_violations` and `navigation` used to be here too. Neither ends a paper
 * any more: a violation count is a record for the reviewer, and a reload or a
 * back-navigation is warned about and logged but no longer submits. Removing
 * them from the type is what guarantees no screen can still claim otherwise —
 * every remaining branch has to name one of these two.
 */
export type AutoSubmitCause =
    | 'time_up'
    | 'paused_too_long';

export interface AutoSubmitCopy {
    icon: string;
    title: string;
    /** The reason, stated plainly. Always shown. */
    reason: string;
    /** Extra context — what it means for their result. */
    detail: string;
}

/**
 * Why an exam ended without the student pressing Submit.
 *
 * Nothing here is optional or nice-to-have: an exam that ends by itself and
 * does not say why is indistinguishable from a crash, and that is what students
 * report to their school. Each cause names itself.
 */
export function autoSubmitCopy(
    cause: AutoSubmitCause,
    ctx: { pauseSeconds?: number; violation?: ViolationKind } = {},
): AutoSubmitCopy {
    switch (cause) {
        case 'time_up':
            return {
                icon: '⏱️',
                title: 'Time is up',
                reason: 'Your allotted time for this paper has run out, so the exam was submitted for you.',
                detail: 'Every answer you selected before the timer reached zero has been saved and counted. Unanswered questions are simply left blank.',
            };
        case 'paused_too_long': {
            const secs = ctx.pauseSeconds ?? EXAM_PAUSE_TIMEOUT_SEC;
            // Name the specific thing that paused it. "Not returned to
            // fullscreen" was the only reason ever given, and it was simply
            // wrong for two of the three cases — a student who had alt-tabbed to
            // a notification was told about a fullscreen rule they had not
            // broken, and had no idea what to avoid next time.
            const cause =
                ctx.violation === 'tab_switch' ? 'you switched to another tab'
                : ctx.violation === 'window_blur' ? 'you moved to another window or app'
                : 'you left fullscreen';
            return {
                icon: '⏸️',
                title: 'Exam ended: away too long',
                reason: `Your exam paused because ${cause}, and it was not brought back within ${secs} seconds, so it was submitted for you.`,
                detail: 'Every answer you gave before the pause has been saved and counted. This attempt has been flagged for review by the exam team.',
            };
        }
    }
}
