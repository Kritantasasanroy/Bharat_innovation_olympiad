import type { Metadata } from 'next';
import { canonical } from '@/lib/seo';

/**
 * `page.tsx` here is a client component, and a client component cannot export
 * `metadata` — without this layout the route silently inherits the root
 * layout's title and description, which is what made /register/, /login/ and
 * the homepage share one identical search result.
 */
export const metadata: Metadata = {
    title: 'Register for the Bharat Innovation Olympiad — Grades 6–12',
    description:
        'Register for the Bharat Innovation Olympiad by Lemon Ideas. Open to students in ' +
        'Grades 6–12 across India. Registrations close 19th December; exams run in slots ' +
        'on Sundays with results on 16th January 2027.',
    alternates: { canonical: canonical('/register') },
    openGraph: {
        title: 'Register for the Bharat Innovation Olympiad — Grades 6–12',
        description:
            'Register for the Bharat Innovation Olympiad by Lemon Ideas. Open to students in ' +
            'Grades 6–12 across India.',
        url: canonical('/register'),
    },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
