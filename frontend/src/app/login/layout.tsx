import type { Metadata } from 'next';
import { canonical } from '@/lib/seo';

/** See the note in ../register/layout.tsx — client pages cannot export metadata. */
export const metadata: Metadata = {
    title: 'Sign in — Bharat Innovation Olympiad',
    description:
        'Sign in to your Bharat Innovation Olympiad account to book an exam slot, access ' +
        'training and orientation sessions, download your admit card and view results.',
    alternates: { canonical: canonical('/login') },
    openGraph: {
        title: 'Sign in — Bharat Innovation Olympiad',
        description:
            'Sign in to your Bharat Innovation Olympiad account to book a slot, train and ' +
            'view results.',
        url: canonical('/login'),
    },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
