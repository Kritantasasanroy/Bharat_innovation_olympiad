/**
 * Orientation and acclimatisation copy.
 *
 * "Thank you and detailed messages for acclamatization, orientation" and
 * "Participant to be present during registration: strong communication and check
 * before registration".
 *
 * One source, used by the registration presence gate, the registration success
 * panel and the dashboard. The welcome *email* deliberately keeps its own copy in
 * `backend/src/notification/templates.ts` — it cannot import from the frontend,
 * and duplicating four sentences beats a shared package for two call sites. If
 * these lists change materially, change the email too.
 */

/** The technology requirements, straight from the olympiad's published spec. */
export const TECH_REQUIREMENTS = [
    { label: 'Device', value: 'Laptop or desktop (preferred), or a tablet with a webcam' },
    { label: 'Webcam', value: 'Working, 720p or better' },
    { label: 'Microphone', value: 'Working' },
    { label: 'Internet', value: 'At least 2 Mbps' },
    { label: 'Browser', value: 'Google Chrome or Microsoft Edge, latest version' },
    { label: 'Screen', value: '1024 × 768 or larger' },
    { label: 'Operating system', value: 'Windows 10+, macOS 10.14+, or ChromeOS' },
] as const;

/**
 * Why the student themselves has to be at the keyboard during registration.
 *
 * This is the "strong communication and check before registration" item. It is
 * shown *before* any field is filled in, because the failure it prevents —
 * a parent registering on a child's behalf and enrolling their own face — is
 * unrecoverable without support intervention.
 */
export const PRESENCE_POINTS = [
    {
        icon: '🪪',
        title: 'The ward must be at the keyboard',
        body: 'Registration ends with a face scan that identifies the ward in every exam. If someone else\'s face is enrolled, the ward will be flagged during their paper and may be disqualified.',
    },
    {
        icon: '📷',
        title: 'The camera will be switched on',
        // Precise about the one case where a picture *is* kept. The old wording
        // said no picture is ever saved, which stopped being true the moment
        // violations started capturing a frame — and a privacy promise that is
        // quietly false is worse than one that is narrower than you would like.
        body: 'We ask for camera permission to capture the face scan. It is stored as an encrypted set of numbers, not as a photo. During an exam a photo is saved only if a violation is recorded, and it is kept with that paper for the review team.',
    },
    {
        icon: '👨‍👩‍👧',
        title: 'A parent or guardian is needed too',
        body: 'One section of the form is for a parent or guardian, including their consent. The ward cannot sit an exam until it is completed.',
    },
    {
        icon: '⏱️',
        title: 'Set aside about ten minutes',
        body: 'Registration runs in one sitting: details, email verification, face scan, the parent section, and payment.',
    },
] as const;

/** What happens after registration — the acclimatisation steps. */
export const NEXT_STEPS = [
    {
        title: 'Choose your exam schedule',
        body: 'Places in each sitting are limited. Once you confirm a schedule it cannot be changed from your account, so pick a time you are certain about.',
    },
    {
        title: 'Take the practice paper',
        body: 'It runs in exactly the same environment as the real exam: fullscreen, webcam, timer and all. It is not scored, you can retake it, and it is required before your real paper will start.',
    },
    {
        title: 'Check your device early',
        body: 'Do not leave the camera and internet check until exam day. Run the practice paper on the device you actually intend to use.',
    },
    {
        title: 'On the day',
        body: 'Sit somewhere quiet and well-lit with a plain wall behind you, keep a school or photo ID nearby, and be signed in fifteen minutes before your schedule opens.',
    },
] as const;

/** The thank-you shown once registration is fully complete. */
export const THANK_YOU = {
    heading: 'You\'re registered. Welcome to the Olympiad.',
    body: 'Your place is confirmed and your roll number is issued. We have emailed it to you, so keep that email, as support will ask for it.',
} as const;

/**
 * What the proctoring actually watches for.
 *
 * Listed openly on the instructions page: a student who knows the rules can
 * follow them, and surprise is what makes proctoring feel punitive. Matches the
 * detections implemented in `useFaceProctor` and `useFullscreenMonitor` — do not
 * list anything here that is not genuinely detected.
 */
export const MONITORED_ACTIVITIES = [
    'Someone else in the picture as well as you',
    'You looking away from the screen for a long stretch',
    'Your face not being visible at all',
    'A face that is not the one you scanned when you registered',
    'Leaving fullscreen, switching tabs, or opening another app',
    // Both were genuinely detected and neither was listed, which is exactly the
    // surprise this list exists to prevent — a student met the screenshot rule
    // for the first time as a warning telling them they had broken it.
    'Taking a screenshot, or trying to print the paper',
    'Nothing moving on your screen for a long stretch',
] as const;
