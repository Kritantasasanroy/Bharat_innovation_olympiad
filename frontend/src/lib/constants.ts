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

// Minimum viewport for "10-inch class" screens
export const MIN_VIEWPORT_WIDTH = 800; // Adjusted for smaller 10-inch tablets (often 800x1280 or similar)
export const MIN_VIEWPORT_HEIGHT = 600;

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
