/**
 * Canonical site identity and the JSON-LD entity graph.
 *
 * The public marketing domain is the canonical one even though this same app is
 * also deployed to the exam hostname — one domain owns the search identity, and
 * the auth-gated routes that only exist on the exam host are `noindex` anyway
 * (see the X-Robots-Tag rules in vercel.json).
 */
export const SITE_URL = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.innovationolympiad.in'
).replace(/\/$/, '');

/** Absolute URL for a route, with the trailing slash `trailingSlash: true` emits. */
export const canonical = (path = '/') => {
    const clean = `/${path.replace(/^\/|\/$/g, '')}`;
    return clean === '/' ? `${SITE_URL}/` : `${SITE_URL}${clean}/`;
};

/**
 * For the auth-gated routes. Emitted as a real `<meta name="robots">` rather
 * than an `X-Robots-Tag` header because Vercel applies only the first matching
 * `headers` entry, so the catch-all security-header rule shadows any per-route
 * rule placed after it — the header silently never appears.
 */
export const NOINDEX = {
    robots: { index: false, follow: false },
} as const;

const DEEPAK = `${SITE_URL}/#deepak-menaria`;
const LEMON_IDEAS = `${SITE_URL}/#lemon-ideas`;
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * Entity graph, not a pile of separate blobs: every node is `@id`-linked so
 * Google can resolve one brand (Bharat Innovation Olympiad) to its parent
 * (Lemon Ideas), its sibling programmes (Innopreneurs) and its founder, rather
 * than reading four unrelated organisations.
 */
export const siteJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Person',
            '@id': DEEPAK,
            name: 'Deepak Menaria',
            jobTitle: 'Founder',
            worksFor: { '@id': LEMON_IDEAS },
            sameAs: ['https://www.linkedin.com/in/deepakmenaria/'],
        },
        {
            '@type': 'Organization',
            '@id': LEMON_IDEAS,
            name: 'Lemon Ideas',
            url: 'https://www.lemonideas.in',
            logo: `${SITE_URL}/lemon-ideas-logo.png`,
            foundingDate: '2013',
            founder: { '@id': DEEPAK },
            email: 'olympiad@lemonideas.in',
            sameAs: [
                'https://www.innopreneurs.in',
                'https://www.instagram.com/lemon_ideas/',
                'https://www.linkedin.com/company/lemonideas/',
            ],
            subOrganization: [{ '@id': ORGANIZATION_ID }],
        },
        {
            '@type': ['Organization', 'EducationalOrganization'],
            '@id': ORGANIZATION_ID,
            name: 'Bharat Innovation Olympiad',
            alternateName: ['Innovation Olympiad', 'BIO Olympiad'],
            url: canonical('/'),
            logo: `${SITE_URL}/bio-logo.png`,
            description:
                "India's innovation and future-skills olympiad for Grades 6–12, by Lemon Ideas. " +
                'Assessed across five future-focused dimensions, not memorisation.',
            email: 'olympiad@lemonideas.in',
            parentOrganization: { '@id': LEMON_IDEAS },
            founder: { '@id': DEEPAK },
            areaServed: 'IN',
            sameAs: [
                'https://www.instagram.com/lemon_ideas/',
                'https://www.linkedin.com/company/lemonideas/',
                'https://www.innopreneurs.in/junior-contest',
            ],
        },
        {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            url: canonical('/'),
            name: 'Bharat Innovation Olympiad',
            description:
                'Discover your potential beyond academics — the Bharat Innovation Olympiad ' +
                'for Grades 6–12, by Lemon Ideas.',
            publisher: { '@id': ORGANIZATION_ID },
            inLanguage: 'en-IN',
        },
        {
            '@type': 'WebApplication',
            '@id': `${SITE_URL}/#platform`,
            name: 'Bharat Innovation Olympiad Platform',
            url: canonical('/'),
            applicationCategory: 'EducationalApplication',
            operatingSystem: 'Web',
            browserRequirements: 'Requires a modern browser with JavaScript and a camera.',
            publisher: { '@id': ORGANIZATION_ID },
            author: {
                '@type': 'Person',
                '@id': `${SITE_URL}/#kritanta-sasan-roy`,
                name: 'Kritanta Sasan Roy',
                jobTitle: 'Software Developer',
                sameAs: ['https://www.linkedin.com/in/kritantasasanroy/'],
            },
        },
    ],
};
