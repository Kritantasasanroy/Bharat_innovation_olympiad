// Application constants

export const APP_NAME = 'Bharat Innovation Olympiad';
export const APP_SHORT = 'BIO';
export const COMPANY_NAME = 'Lemon Ideas';
export const TAGLINE = 'Become Future Ready';

/**
 * Beta feedback forms, shown as full-page interstitials right after the two
 * moments worth asking about: finishing registration, and finishing an exam.
 *
 * Embedded rather than linked so the student stays inside BIO branding and a
 * popup blocker cannot swallow the form. `embedded=true` is Google's own flag
 * for rendering a form inside an iframe.
 */
export const FEEDBACK_FORMS = {
    registration:
        'https://docs.google.com/forms/d/e/1FAIpQLScwx9fvVK5cyTnRj2CS4YYm6sCTO5SBofjhcdWoneQyUhhCHA/viewform',
    exam:
        'https://docs.google.com/forms/d/e/1FAIpQLSc5WZvFyvC4gogV2HwCVsIDvXyl1WZPzNlIO4NeogNCOOilEQ/viewform',
} as const;

export const embeddedFormUrl = (url: string) => `${url}?embedded=true`;

/**
 * Minimum **screen** size to sit an exam on, in CSS pixels.
 *
 * 1024×768 is the published requirement in the olympiad's own technology spec
 * ("Screen Resolution 1024 x 768 or higher") and that is a *hardware* figure.
 * The check has to be made in CSS pixels, and the two are not the same number:
 * Windows ships almost every laptop at 125% or 150% display scaling, so a
 * genuine 1920×1080 panel reports `screen.height` as 720 (150%) or 864 (125%),
 * and a 1366×768 panel at 125% reports 614. Requiring 768 CSS pixels of height
 * therefore rejected the ordinary Indian school laptop this exam is written for
 * — which is what "it is not letting me enter" was.
 *
 * So the height floor is the smallest the player's layout genuinely works at
 * (600 CSS px — 1080p at 150% scaling, with room to spare), while the width
 * floor stays 1024 because the three-pane layout — header, question column,
 * question navigator — really does need it, and no common scaling factor takes
 * a laptop below it.
 *
 * ## Why the *window* is not checked
 *
 * The exam is entered fullscreen (`lib/fullscreen.ts`), which makes the window
 * the size of the screen. Failing a student whose browser window happened to be
 * small on the instructions page was rejecting them for something the very next
 * click fixes. `TooSmallForExam` is now reached only by a device that cannot
 * run the player at any window size — a phone.
 */
export const MIN_VIEWPORT_WIDTH = 1024;
export const MIN_VIEWPORT_HEIGHT = 600;

/**
 * Terms & conditions version the registration form presents.
 *
 * Sent to `/auth/sync` and stored on the user, so a later revision is
 * distinguishable from the text a student actually agreed to. Bump this whenever
 * `/terms` changes materially.
 */
export const TERMS_VERSION = '2026-07-v1';

// Timer thresholds (seconds)
export const TIMER_WARNING_THRESHOLD = 300;  // 5 minutes
export const TIMER_DANGER_THRESHOLD = 60;    // 1 minute

// Proctoring
export const PROCTOR_FRAME_INTERVAL_MS = 10_000;  // 10 seconds
export const PROCTOR_FRAME_WIDTH = 320;
export const PROCTOR_FRAME_HEIGHT = 240;
export const PROCTOR_FRAME_QUALITY = 0.6;

// Heartbeat
export const HEARTBEAT_INTERVAL_MS = 10_000;  // 10 seconds

// Class bands
export const CLASS_BANDS = [6, 7, 8, 9, 10, 11, 12];

// XP rewards
export const XP_PER_CORRECT = 10;
export const XP_PER_STREAK = 5;
export const XP_PER_EXAM_COMPLETE = 50;
