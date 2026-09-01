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
    { label: 'Screen Resolution', value: '1024 x 768 or larger' },
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
        icon: '🧑‍💻',
        title: 'The exam participant must be present',
        body: 'Registration includes a face scan that identifies the participant in every exam. If someone else\'s face is enrolled, the participant will be flagged during their Innovation Olympiad exam and may be disqualified.',
    },
    {
        icon: '📷',
        title: 'The camera will be switched on',
        // Precise about the two cases where a picture *is* kept. The old wording
        // said no picture is ever saved, which stopped being true the moment
        // violations started capturing a frame — and a privacy promise that is
        // quietly false is worse than one that is narrower than you would like.
        body: 'We ask for camera permission to capture the face scan. It is stored as an encrypted set of numbers used to verify the participant during their exam, and this one photo is kept and printed on their certificate. During an exam a further photo is saved only if a violation is recorded, and it is kept with that Innovation Olympiad exam for the review team.',
    },
    {
        icon: '👨‍👩‍👧',
        title: 'A parent or guardian is needed too',
        body: 'One section in the registration process is for a parent or guardian, including their consent. The participant cannot sit an exam until parent/guardian consent is completed.',
    },
    {
        icon: '🪪',
        title: 'Keep a school or photo ID card handy',
        body: 'The ID is uploaded during the registration process for verification of identity and is needed on exam day for verification.',
    },
    {
        icon: '⏱️',
        title: 'Set aside about ten minutes - Registration runs in one sitting',
        body: 'details, email verification, payment, face scan, and parent consent.',
    },
] as const;

/** What happens after registration — the acclimatisation steps. */
export const NEXT_STEPS = [
    {
        title: 'Choose your exam schedule',
        body: 'Slots in each sitting are limited. Once you confirm a schedule, it cannot be changed from your account, so pick a time you are certain about.',
    },
    {
        title: 'Take the practice Innovation Olympiad exam to acclimatise with the online exam environment. It runs in exactly the same environment as the actual exam',
        body: 'fullscreen, webcam, timer and all. It is not scored; you can retake it, and it is mandatory before your Bharat Innovation Olympiad exam commences.',
    },
    {
        title: 'Check your devices early',
        body: 'Do not wait until exam day. Test your camera and internet connection. Appear for the practice tests on the device you intend to use for the Bharat Innovation Olympiad exam.',
    },
    {
        title: 'On the day',
        body: 'On exam day, Take the exam in a quiet, well-lit place with a plain wall behind you, keep a school or photo ID nearby, and be sign in 15 minutes before your scheduled time.',
    },
] as const;

/** The confirmation shown once payment is received. */
export const THANK_YOU = {
    heading: 'Payment received — you\'re almost registered.',
    body: 'Your roll number has already been issued. Continue with the face scan and parent consent to finish. We have emailed your roll number, so keep that email safe for further reference.',
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
    'Taking a screenshot, or trying to print the Innovation Olympiad exam',
    'Nothing moving on your screen for a long stretch',
] as const;
