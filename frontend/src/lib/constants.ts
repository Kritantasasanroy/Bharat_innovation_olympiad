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
 * Minimum viewport to *sit an exam*.
 *
 * 1024×768 is the published requirement in the olympiad's own technology
 * spec ("Screen Resolution 1024 x 768 or higher"), and it is what the exam
 * player's three-pane layout — header, question column, question navigator —
 * genuinely needs. It was 800×600, which let a small tablet through into a
 * layout that overlapped.
 *
 * This gate applies to the exam player only. Every other page is responsive
 * down to ~360px; a phone reaching the player gets `TooSmallForExam`, which
 * explains what device to use instead of failing a nameless "viewport" check.
 */
export const MIN_VIEWPORT_WIDTH = 1024;
export const MIN_VIEWPORT_HEIGHT = 768;

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
