import type { LimonMood } from '@/components/limon/LimonAvatar';

/**
 * What Limon says, and where he points, on each guided tour.
 *
 * ## Why the scripts live apart from the engine
 *
 * The copy is the part that gets rewritten — after every beta round, and by
 * people who are not going to open a React component to do it. Keeping the
 * steps as plain data means changing what Limon says is editing a string in a
 * list, and it makes the whole script reviewable in one screen rather than
 * scattered through the JSX of five pages.
 *
 * ## Targeting by data attribute, not by CSS class
 *
 * A step points at an element via `data-limon="<id>"`. Class names describe how
 * something looks and get renamed the moment it is restyled, which would break
 * the tour silently and invisibly — the highlight would simply stop appearing.
 * A dedicated attribute exists only for this, so it survives restyling and it is
 * obvious to anyone editing the markup that something depends on it.
 *
 * A step whose target is missing is **skipped, not fatal**: pages differ by
 * whether a student has paid, has a school, has sat the trial. A tour must never
 * strand someone on a step pointing at nothing.
 */

export interface TourStep {
    /** `data-limon` value of the element to highlight. Omit to centre the card. */
    target?: string;
    title: string;
    body: string;
    mood?: LimonMood;
    /** Preferred side of the target. The engine flips it if it would overflow. */
    placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface Tour {
    id: TourId;
    /** Shown on the opening card, before the first step. */
    intro: string;
    steps: TourStep[];
    /** Shown once the last step is done. */
    outro?: string;
}

export type TourId =
    | 'home'
    | 'register'
    | 'dashboard'
    | 'training'
    | 'exams'
    | 'results'
    | 'certificates'
    | 'support'
    | 'profile'
    | 'exam';

/**
 * Registration. Runs on `/register`, before anything has been filled in.
 *
 * Deliberately short — five steps — because it plays *in front of* a form the
 * student is trying to fill in, and a tour that outstays its welcome is a tour
 * people learn to dismiss without reading.
 */
const REGISTER_TOUR: Tour = {
    id: 'register',
    intro: "Hi, I'm Limon! I'll help you register. It takes about ten minutes, and I'll explain each bit as we go. You can skip me any time.",
    steps: [
        {
            target: 'register-steps',
            title: 'Six steps, in this order',
            body: "Your details, your email code, a face scan, payment, then your parent's section. You can stop after the face scan and finish the rest later from your dashboard.",
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'register-class',
            title: 'Choose your class carefully',
            body: "This decides which Innovation Olympiad exam you sit and who you're ranked against, and it's final once it's set. If you pick the wrong one you'll need to raise a support ticket to fix it.",
            mood: 'concerned',
            placement: 'top',
        },
        {
            // Section lives inside this block but only appears once a school is
            // chosen, so it is covered here rather than as its own step — a
            // step pointing at a field that does not exist yet gets dropped
            // when the tour starts, and the student would never hear about it.
            target: 'register-school',
            title: 'Find your school, then your section',
            body: "Just type the school's name. Only use a school code if your school actually gave you one. Most participants don't have one, and you can add your school if it isn't listed. Once you pick it, put your section exactly as your school writes it: A, B2, Rose. Write NA if your school doesn't use sections.",
            mood: 'talking',
            placement: 'top',
        },
        {
            title: 'One thing I have to be firm about',
            body: "The face scan at step 4 has to be done by you, not a parent. It's what I use to recognise you in the exam. If someone else's face is scanned, you'll be flagged during your Innovation Olympiad exam.",
            mood: 'concerned',
        },
    ],
    outro: "That's everything. Fill it in at your own pace, I'll be on your dashboard when you're done.",
};

/**
 * The portal. Runs on `/dashboard` the first time a registered student lands.
 *
 * Covers every tab in the navigation, because "where do I find my result" is the
 * single most common support question and the answer is a tab that was always
 * there.
 */
const DASHBOARD_TOUR: Tour = {
    id: 'dashboard',
    intro: "Welcome in! I'm Limon. Let me show you around, it's quick, and then you'll know where everything lives.",
    steps: [
        {
            target: 'dashboard-roll',
            title: 'Your roll number',
            body: "This is you, for the whole season. Support will ask for it, so keep the email we sent you.",
            mood: 'happy',
            placement: 'bottom',
        },
        {
            target: 'dashboard-stats',
            title: 'How you are doing',
            body: 'Exams open to you now, how many you have finished, and your average score so far.',
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'dashboard-exams',
            title: 'Your exams',
            body: "Everything you can sit. Start with the free practice Innovation Olympiad exam: it runs in exactly the same screen as the real thing, and you can retake it as often as you like.",
            mood: 'talking',
            placement: 'top',
        },
        {
            target: 'nav-training',
            title: 'Training',
            body: 'Tick off the training sessions you have attended here. Your school and the review team can see it, and it appears on your certificates page.',
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'nav-exams',
            title: 'Exams',
            body: 'The full list, with schedules and instructions. This is where you book your sitting once you have paid.',
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'nav-results',
            title: 'Results',
            body: "Your scores appear here once marking is released. Provisional first, then your final rank and a breakdown across the five pillars when the season closes.",
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'nav-certificates',
            title: 'Certificates',
            body: 'Your olympiad certificates and your training certificates, kept separately so you can find either one.',
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'nav-support',
            title: 'Support',
            body: "If anything goes wrong (a power cut during your exam, a wrong class, a score that looks off), tell us here and a person will answer.",
            mood: 'happy',
            placement: 'bottom',
        },
    ],
    outro: "That's the whole portal. Take the practice Innovation Olympiad exam when you're ready, and I'll walk you through the exam screen there.",
};

/**
 * The exam player. Runs **only** inside the trial paper.
 *
 * Never on a real exam: the clock is running, and stopping a student to explain
 * a button they are already pressing costs them marks. The rehearsal is exactly
 * where this belongs, and it is the argument for making the rehearsal free and
 * unlimited.
 */
const EXAM_TOUR: Tour = {
    id: 'exam',
    intro: "This is the real exam screen: same buttons, same timer, same camera. Nothing here is scored, so let me show you what each part does.",
    steps: [
        {
            target: 'exam-question',
            title: 'The question',
            body: 'Click an answer to pick it. It saves the instant you click: there is nothing to press to save, and no way to lose an answer.',
            mood: 'talking',
            placement: 'right',
        },
        {
            target: 'exam-nav',
            title: 'Moving around',
            body: 'Previous and Next step one at a time. Clear wipes your answer to this question. There is no negative marking, so a guess always beats a blank.',
            mood: 'talking',
            placement: 'top',
        },
        {
            target: 'exam-flag',
            title: 'Mark for later',
            body: 'For a question you want to come back to. It turns orange in the list on the right so you can find it fast. It does not change your answer and nobody is told about it.',
            mood: 'talking',
            placement: 'top',
        },
        {
            target: 'exam-navigator',
            title: 'Jump anywhere',
            body: 'Every question in the Innovation Olympiad exam. Click any number to go straight there, in any order, as often as you like. Green is answered, orange is marked, grey you have not opened yet.',
            mood: 'talking',
            placement: 'left',
        },
        {
            target: 'exam-timer',
            title: 'Your time',
            body: 'Counts down from the start. It runs on our servers, so a wobbly internet connection cannot steal time from you. Orange at five minutes, red at one.',
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'exam-violations',
            title: 'This number',
            body: "Things I have to record: leaving fullscreen, switching apps, my not being able to see your face. It does not end your exam. A person just reads it afterwards. Hover the little i for the full list.",
            mood: 'concerned',
            placement: 'bottom',
        },
        {
            target: 'exam-reload',
            title: 'If the page looks stuck',
            body: 'Use this, not F5. It keeps your answers and your time. An image that will not load is the usual reason.',
            mood: 'talking',
            placement: 'bottom',
        },
        {
            target: 'exam-submit',
            title: 'Finishing',
            body: "Submit when you are done. I will tell you how many questions are still blank and ask you to confirm, so one stray click cannot end your Innovation Olympiad exam.",
            mood: 'happy',
            placement: 'left',
        },
    ],
    outro: "That is the lot. Have a go at these questions, nothing here counts. When you are comfortable, your real Innovation Olympiad exam will feel like somewhere you have already been.",
};

/**
 * The remaining screens.
 *
 * Deliberately short — two to four steps each. These are reached by pressing
 * "Need help?", which means the student has a specific question right now, and
 * the answer to it should not be the eighth step of a tour. The long ones are
 * the two that run automatically (registration and the portal), where the
 * student has no question yet and is being oriented.
 *
 * None of them targets anything conditional, so every step survives whatever
 * state the page is in.
 */
const HOME_TOUR: Tour = {
    id: 'home',
    intro: "Hi, I'm Limon! I look after participants during the Olympiad. Want a quick tour of this page?",
    steps: [
        {
            title: 'What this is',
            body: "The Bharat Innovation Olympiad, for Grades 6 to 12. It doesn't test what you've memorised. It looks at how you think, solve problems and come up with ideas.",
            mood: 'talking',
        },
        {
            title: 'It is taken from home',
            body: "On your own laptop, on a schedule you choose, with your camera on so we know it's really you. Scroll down and I explain exactly how that's kept fair.",
            mood: 'talking',
        },
        {
            title: 'These are real participants',
            body: 'The stories that rotate below are past participants and what they went on to build. They started where you are.',
            mood: 'happy',
        },
        {
            title: 'Ready?',
            body: "Press Register to start. It takes about ten minutes and I'll walk you through every step of it.",
            mood: 'celebrating',
        },
    ],
};

const TRAINING_TOUR: Tour = {
    id: 'training',
    intro: "This is where you record the training sessions you've been to.",
    steps: [
        {
            title: 'Tick what you attended',
            body: 'The orientation session and the five pillars the exam is built on. Tick the ones you took part in, then press Save. You can change it whenever you like.',
            mood: 'talking',
        },
        {
            title: 'It is your own answer',
            body: "Nobody marks you present or absent. It doesn't affect your score or your rank, it's a record of what you took part in across the season.",
            mood: 'talking',
        },
        {
            title: 'Where it shows up',
            body: 'Everything you tick appears on your Certificates page, in its own Trainings section, next to your exam certificates.',
            mood: 'happy',
        },
    ],
};

const EXAMS_TOUR: Tour = {
    id: 'exams',
    intro: 'This is every Innovation Olympiad exam open to you.',
    steps: [
        {
            title: 'Start with the practice Innovation Olympiad exam',
            body: "It's free, you can take it as many times as you like, and it runs in exactly the same screen as the real exam: fullscreen, camera, timer and all.",
            mood: 'talking',
        },
        {
            title: 'Then book your schedule',
            body: 'Places in each sitting are limited, and once you confirm a schedule it cannot be changed from your account. So pick a time you are certain about.',
            mood: 'concerned',
        },
        {
            title: 'Check your device early',
            body: "Don't leave the camera and internet check until exam day. Run the practice Innovation Olympiad exam on the device you actually plan to use.",
            mood: 'talking',
        },
    ],
};

const RESULTS_TOUR: Tour = {
    id: 'results',
    intro: 'Your scores land here as soon as marking is released.',
    steps: [
        {
            title: 'Provisional first',
            body: "Your score appears as provisional. It's a real score, but it can still move while proctoring reviews and any grievances are settled.",
            mood: 'talking',
        },
        {
            title: 'Then the final report',
            body: 'When the season closes you get your final score, your rank and percentile, a breakdown across the five pillars, and the answer key with an explanation for every question.',
            mood: 'happy',
        },
        {
            title: 'If something looks wrong',
            body: 'A power cut during your Innovation Olympiad exam, a score that does not look right: raise it from Support and a person will read it and reply.',
            mood: 'concerned',
        },
    ],
};

const CERTIFICATES_TOUR: Tour = {
    id: 'certificates',
    intro: 'Two different things live on this page, so they are kept apart.',
    steps: [
        {
            title: 'Olympiad Exams',
            body: 'Certificates we issue once an exam’s results are released. Each carries a unique number, and anyone can check it is genuine from the public verify link.',
            mood: 'talking',
        },
        {
            title: 'Trainings',
            body: "The sessions you ticked on the Training page. That's your own record, so it carries no score and no verification number. It is not an exam certificate.",
            mood: 'talking',
        },
    ],
};

const SUPPORT_TOUR: Tour = {
    id: 'support',
    intro: 'This is how you reach a person.',
    steps: [
        {
            title: 'What to raise here',
            body: 'A wrong class on your account, something that went wrong during your Innovation Olympiad exam, a schedule you cannot make, a score you want looked at. Anything a page cannot fix by itself.',
            mood: 'talking',
        },
        {
            title: 'Have your roll number ready',
            body: "It's on your dashboard and in your registration email. It's the fastest way for us to find you.",
            mood: 'happy',
        },
    ],
};

const PROFILE_TOUR: Tour = {
    id: 'profile',
    intro: 'Your details, and the two that are deliberately locked.',
    steps: [
        {
            title: 'What you can change',
            body: 'Your name and your contact number. Changing your number needs a quick code, because it also signs you in.',
            mood: 'talking',
        },
        {
            title: 'What you cannot',
            body: 'Your email, your school and your class. Your class decides which Innovation Olympiad exam you sit and who you are ranked against, so it is final once set. Raise a support ticket if it is wrong.',
            mood: 'concerned',
        },
        {
            title: 'Your face scan',
            body: "It's how I recognise you in an exam. Stored as an encrypted set of numbers, not a photo. Re-do it here if you were in bad light the first time.",
            mood: 'searching',
        },
    ],
};

export const TOURS: Record<TourId, Tour> = {
    home: HOME_TOUR,
    register: REGISTER_TOUR,
    dashboard: DASHBOARD_TOUR,
    training: TRAINING_TOUR,
    exams: EXAMS_TOUR,
    results: RESULTS_TOUR,
    certificates: CERTIFICATES_TOUR,
    support: SUPPORT_TOUR,
    profile: PROFILE_TOUR,
    exam: EXAM_TOUR,
};

/**
 * Which tour belongs to a URL.
 *
 * Longest-prefix wins, so `/exams/:id/instructions` does not match the `/exams`
 * list tour. The exam player is deliberately absent: it mounts its own tour, and
 * only for the trial run — see the note on {@link EXAM_TOUR}.
 */
export function tourForPath(pathname: string | null): TourId | null {
    if (!pathname) return null;
    if (/^\/exams\/[^/]+\/play/.test(pathname)) return null;
    if (pathname === '/') return 'home';
    const prefixes: [string, TourId][] = [
        ['/register', 'register'],
        ['/dashboard', 'dashboard'],
        ['/training', 'training'],
        ['/exams', 'exams'],
        ['/results', 'results'],
        ['/certificates', 'certificates'],
        ['/support', 'support'],
        ['/profile', 'profile'],
    ];
    const hit = prefixes.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
    return hit ? hit[1] : null;
}

/** Where "has this student seen it?" is remembered. */
export const tourStorageKey = (id: TourId) => `limon_tour_${id}`;

/**
 * Has this tour already been given?
 *
 * `localStorage`, so it survives a session — being re-toured on every sign-in
 * would be maddening — and it fails open: if storage is unavailable (private
 * mode, a locked-down school browser) the tour simply runs, which is the
 * harmless direction to get it wrong in.
 */
export function tourSeen(id: TourId): boolean {
    try {
        return localStorage.getItem(tourStorageKey(id)) === '1';
    } catch {
        return false;
    }
}

export function markTourSeen(id: TourId): void {
    try {
        localStorage.setItem(tourStorageKey(id), '1');
    } catch {
        /* private mode — it will offer itself again, which is not harmful */
    }
}

export function resetTour(id: TourId): void {
    try {
        localStorage.removeItem(tourStorageKey(id));
    } catch {
        /* nothing to clear */
    }
}
