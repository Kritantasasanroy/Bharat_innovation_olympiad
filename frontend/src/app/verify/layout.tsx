import type { Metadata } from 'next';
import { canonical } from '@/lib/seo';

/** See the note in ../register/layout.tsx — client pages cannot export metadata. */
export const metadata: Metadata = {
    title: 'Verify a Certificate — Bharat Innovation Olympiad',
    description:
        'Check a Bharat Innovation Olympiad certificate. Enter the certificate number to ' +
        'confirm the holder, exam, score and rank — no account needed.',
    alternates: { canonical: canonical('/verify') },
    openGraph: {
        title: 'Verify a Certificate — Bharat Innovation Olympiad',
        description:
            'Check a Bharat Innovation Olympiad certificate number — no account needed.',
        url: canonical('/verify'),
    },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
    return children;
}
