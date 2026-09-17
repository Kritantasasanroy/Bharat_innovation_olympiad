/**
 * Single source of truth for landing-page copy shared by the desktop page
 * (`app/page.tsx`) and the mobile variant (`MobileLanding.tsx`). The two used
 * to hand-maintain the same numbers and drifted — stats, takeaways, the
 * credibility statement. Everything the WEBSITE CHANGES brief pins lives here
 * so desktop and mobile change together.
 */

/** The 6-stage participant journey from the brief (#3). */
export const JOURNEY_STAGES = [
    {
        title: 'Registration',
        sub: 'Create your account in minutes',
    },
    {
        title: 'Capacity Building',
        sub: 'Training · Material resources · Guidance & mentoring',
    },
    {
        title: 'Examination',
        sub: 'A fair, proctored online olympiad',
    },
    {
        title: 'Innopreneurs Juniors',
        sub: 'Idea Innovation Contest',
    },
    {
        title: 'Pre-Incubation Cohort',
        sub: 'A year of mentoring & training',
    },
    {
        title: 'Startup Internship',
        sub: 'Work inside real startups',
    },
] as const;

/** Program statistics from the brief (#4). */
export const STATISTICS = [
    { value: '250+', label: 'Schools' },
    { value: '1 Lakh+', label: 'Young Innovators' },
    { value: '25+', label: 'States & UTs' },
] as const;

/**
 * The credibility statement, verbatim from the brief (#6) — it is the sentence
 * that answers "can I trust a computer-proctored exam?".
 */
export const CREDIBILITY_STATEMENT =
    'Any Innovation Olympiad exam flagged for review is carefully examined by a ' +
    'human reviewer, with written reasons documented before any decision is made. ' +
    'No action or conclusion is based on computer-generated flags alone.';

/** The five dimensions, in display order (#11): Problem Solving first, EQ second. */
export const DIMENSIONS = [
    {
        n: '01',
        title: 'Problem Solving & Innovation',
        teaser: 'Thinking creatively about problems that matter.',
        body: 'Innovation begins with understanding problems that matter. This dimension encourages students to observe the world around them, think creatively, explore multiple solutions and validate ideas through experimentation. Drawing upon design thinking, adaptability, ethical decision-making and evidence-based reasoning, it nurtures the confidence to transform ideas into meaningful innovations that create positive impact.',
    },
    {
        title: 'Entrepreneurship Mindset',
        n: '02',
        body: 'Entrepreneurship is not just about starting a business — it is a way of thinking. This dimension develops the ability to identify opportunities, take initiative, solve problems creatively and make responsible decisions. Students build an entrepreneurial mindset through concepts such as customer empathy, teamwork, planning, resource management, ethics and business awareness, empowering them to become creators of opportunities rather than seekers of opportunities.',
        teaser: 'Thinking and acting like a creator of opportunities.',
    },
    {
        n: '03',
        title: 'Emerging Technologies & Digital Readiness, STEM',
        teaser: 'From coding logic to AI, space and quantum.',
        body: 'The future belongs to those who understand and responsibly use technology. Beginning with strong STEM (Science, Technology, Engineering and Mathematics) foundations, this dimension introduces students to computational thinking, coding logic, robotics, artificial intelligence, machine learning and cybersecurity. It further expands their horizons to frontier technologies such as space technology, biotechnology, quantum computing and advanced digital systems, preparing them to become informed creators and responsible users of tomorrow\'s technologies.',
    },
    {
        n: '04',
        title: 'Future Readiness & Global Awareness',
        teaser: 'Careers, sustainability and the interconnected world.',
        body: 'Preparing for the future requires more than academic knowledge — it demands adaptability, lifelong learning and global awareness. This dimension develops students\' understanding of future careers, sustainability, climate action, health and well-being, and the interconnected world through the lens of global challenges and opportunities. It also inspires them to contribute towards the vision of Viksit Bharat 2047, encouraging every learner to see themselves as an active participant in building a developed, innovative and globally respected India.',
    },
    {
        n: '05',
        title: 'Financial Readiness',
        teaser: 'Money, budgeting and financial safety as life skills.',
        body: 'Financial literacy is an essential life skill in an increasingly connected world. This dimension helps students understand money management, saving, investing, budgeting and responsible financial decision-making while introducing them to digital banking, UPI, financial safety and cyber awareness. It also broadens their perspective by building awareness of the global economy, international trade, world currencies and the role of financial systems in shaping prosperous individuals, businesses and nations.',
    },
] as const;

/** The four benefits (#12): bootcamp card replaced by Experiential Learning. */
export const BENEFITS = [
    { title: 'National Rankings', desc: 'Stand out with verified All-India, State, City & School ranks.' },
    { title: 'Innopreneurs Advantage', desc: 'A direct pathway into startup contests and innovation labs.' },
    { title: 'World Skill Challenge', desc: 'Qualify for global future-skills challenges and exposure.' },
    {
        title: 'Experiential Learning Opportunity',
        desc: 'Pre-Incubation cohort, startup internship, and bootcamp — learning by building, not just by listening.',
    },
] as const;

/** What every participant receives — merged with takeaways, deduped (#13). */
export const RECEIVES = [
    'E-certificates for the exam and the training',
    'A detailed report with answer key, explanations, ranks & analytics',
    'Ranking & benchmarking at school, city, state and national level',
    'Printed certificates & medals for top 3 and school-level rankers',
    'Access to the Junior community at Innopreneurs',
    'Advantage of the Lemon Ideas ecosystem since 2013',
] as const;

/** Takeaways (#13, #16): Top 2% (not 5%), pre-finale entry, ₹5 lakh (not 50). */
export const TAKEAWAYS = [
    'Learning beyond academics & syllabus',
    '6 hours of training, orientation & interaction + 1 hour exam',
    'An exam guide with sample paper for preparation',
    'Ranking & benchmarking at school, city and national level',
    'Top 2% get direct entry to the Innopreneurs Next Gen innovation contest (pre-finale) — awards & benefits worth ₹5 lakh',
    'Roadmap towards a passion project, innovation & startup building',
    'Advantage of the Lemon Ideas ecosystem — since 2013',
] as const;

/** The first Sunday that is at least 15 days from today (#5). */
export function nextOlympiadDate(): string {
    const d = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Program value vs offered price, shown beside every Register CTA (#2). */
export const COURSE_VALUE = {
    mrp: '₹1,449/-',
    price: '₹379/-',
    note: 'including taxes & platform fee',
} as const;

/** School-partner inquiry (#22) — opens the visitor's mail client prefilled. */
export const SCHOOL_PARTNER_EMAIL = 'olympiad@lemonideas.in';

export function schoolPartnerMailto(fields: {
    to?: string;
    school: string;
    city: string;
    contact: string;
    phoneEmail: string;
}): string {
    const subject = `School Partner inquiry — ${fields.school || 'Bharat Innovation Olympiad'}`;
    const body = [
        `School name: ${fields.school}`,
        `City: ${fields.city}`,
        `Contact person: ${fields.contact}`,
        `Phone / email: ${fields.phoneEmail}`,
        '',
        'We would like to know more about becoming a school partner of the Bharat Innovation Olympiad.',
    ].join('\n');
    return `mailto:${fields.to ?? SCHOOL_PARTNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Footer community links (#19). */
export const COMMUNITY_LINKS = {
    whatsapp: 'https://chat.whatsapp.com/KS12TeM47vv3gyoerqW6HU?s=cl&p=a&ilr=0',
    instagram: 'https://www.instagram.com/lemon_ideas/?hl=en',
    linkedin: 'https://www.linkedin.com/company/lemonideas/?viewAsMember=true',
    email: 'olympiad@lemonideas.in',
} as const;

/** Event photos used across the landing page (compressed copies in /public). */
export const EVENT_PHOTOS = [
    { src: '/assets/events/event-gadkari-stage.jpg', alt: 'Shri Nitin Gadkari addressing young innovators at a Lemon Ideas event' },
    { src: '/assets/events/event-winners-cheque.jpg', alt: 'Innopreneurs Junior winners with certificates and award cheque' },
    { src: '/assets/events/event-school-group.jpg', alt: 'School participants felicitated with certificates and trophies' },
    { src: '/assets/events/event-gadkari-team.jpg', alt: 'The Lemon Ideas team with Shri Nitin Gadkari' },
    { src: '/assets/events/event-school-awards.jpg', alt: 'A partner school celebrating its young innovators on stage' },
] as const;
