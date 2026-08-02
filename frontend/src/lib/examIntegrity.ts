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
        what: 'The exam window stopped being fullscreen — usually the Escape key, F11, or the Windows/Command key.',
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
        what: 'Something outside the exam took focus — another window, a notification, or a second screen.',
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
        fix: 'Only the registered student may sit this paper. Make sure it is you in frame, well lit.',
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
 * The consequence line — the part students actually need and the part the old
 * player never showed. Deliberately explicit about the *next* violation rather
 * than only the current count, because "2 of 3" tells a 13-year-old nothing
 * about what happens on 3.
 */
export function violationConsequence(count: number, max: number): string {
    const left = max - count;
    if (left <= 0) return 'This was your final violation. Your exam has been submitted automatically.';
    if (left === 1) return `This was violation ${count} of ${max}. One more and your exam will be submitted automatically and you will not be able to continue.`;
    return `This was violation ${count} of ${max}. After ${max} violations your exam is submitted automatically.`;
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

export type AutoSubmitCause =
    | 'time_up'
    | 'max_violations'
    | 'paused_too_long'
    | 'navigation';

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
    ctx: { maxViolations?: number; pauseSeconds?: number; violation?: ViolationKind } = {},
): AutoSubmitCopy {
    switch (cause) {
        case 'time_up':
            return {
                icon: '⏱️',
                title: 'Time is up',
                reason: 'Your allotted time for this paper has run out, so the exam was submitted for you.',
                detail: 'Every answer you selected before the timer reached zero has been saved and counted. Unanswered questions are simply left blank.',
            };
        case 'max_violations': {
            const max = ctx.maxViolations ?? 3;
            const rule = ctx.violation ? violationCopy(ctx.violation) : null;
            return {
                icon: '🚫',
                title: 'Exam ended — final violation',
                reason: rule
                    ? `${rule.title}. That was violation ${max} of ${max}, the limit for this exam, so your paper was submitted automatically.`
                    : `You reached the limit of ${max} exam integrity violations, so your paper was submitted automatically.`,
                detail: 'Every answer you gave before this point has been saved and counted. This attempt has been flagged for review by the exam team, who will look at what was recorded before deciding anything.',
            };
        }
        case 'paused_too_long': {
            const secs = ctx.pauseSeconds ?? 20;
            return {
                icon: '⏸️',
                title: 'Exam ended — paused too long',
                reason: `Your exam was paused for more than ${secs} seconds because it was not returned to fullscreen, so it was submitted automatically.`,
                detail: 'Every answer you gave before the pause has been saved and counted. This attempt has been flagged for review by the exam team.',
            };
        }
        case 'navigation':
            return {
                icon: '🔒',
                title: 'Exam locked — you left the exam page',
                reason: 'The browser reloaded or navigated away from the exam. For fairness, an exam can only be sat once and in one continuous sitting, so this paper has been submitted and locked.',
                detail: 'Every answer you gave before this point has been saved and counted. You cannot re-open this paper. This attempt has been flagged for review by the exam team.',
            };
    }
}
