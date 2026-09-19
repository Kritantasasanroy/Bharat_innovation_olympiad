import FeedbackTab from '@/components/FeedbackTab';
import LimonHelp from '@/components/limon/LimonHelp';
import ScrollToError from '@/components/ScrollToError';
import ThemeProvider from '@/components/ThemeProvider';
import type { Metadata, Viewport } from 'next';
import { SITE_URL, canonical, siteJsonLd } from '@/lib/seo';
import './globals.css';

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
};

export const metadata: Metadata = {
    // Needed to turn the relative openGraph image below into an absolute URL.
    // Without it Next falls back to localhost:3000 and warns at build time.
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: canonical('/') },
    title: 'Bharat Innovation Olympiad | Become Future Ready',
    description:
        'Discover your potential beyond academics by developing the mindset, skills and awareness ' +
        'to innovate, solve real-world problems and confidently shape the future of India and the world. ' +
        'For participants in Grades 6–12, by Lemon Ideas.',
    // Left as literal search terms families actually type into Google, rather
    // than renamed to match the in-app "ward" terminology — nobody searches
    // "olympiad for wards", and nothing here is ever rendered on a page.
    keywords: [
        'olympiad', 'innovation', 'future ready', 'entrepreneurship', 'STEM',
        'exam', 'India', 'students', 'Lemon Ideas', 'Viksit Bharat',
        'innovation olympiad', 'bharat innovation olympiad', 'innopreneurs junior',
        'online olympiad exam', 'future skills', 'innovation contest for students',
        'school olympiad India', 'entrepreneurship mindset', 'financial literacy olympiad',
    ],
    icons: { icon: '/icon.png', apple: '/icon.png' },
    applicationName: 'Bharat Innovation Olympiad',
    authors: [{ name: 'Lemon Ideas', url: 'https://www.lemonideas.in' }],
    creator: 'Kritanta Sasan Roy',
    publisher: 'Lemon Ideas',
    openGraph: {
        title: 'Bharat Innovation Olympiad: Become Future Ready',
        description:
            'India\'s innovation and future-skills olympiad for Grades 6–12. Assessed across five ' +
            'future-focused dimensions, not memorisation.',
        siteName: 'Bharat Innovation Olympiad',
        type: 'website',
        url: canonical('/'),
        locale: 'en_IN',
        images: ['/bio-logo.png'],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Bharat Innovation Olympiad: Become Future Ready',
        description:
            'India\'s innovation and future-skills olympiad for Grades 6–12, by Lemon Ideas.',
        images: ['/bio-logo.png'],
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" data-theme="light" suppressHydrationWarning>
            <head>
                {/* `metadata.icons` above emits the link tag. The hand-written
                    /favicon.ico this used to reference did not exist and 404'd.
                    The viewport tag comes from `export const viewport` — a
                    hand-written one here produced a duplicate in the head. */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
                />
            </head>
            <body>
                <ThemeProvider>
                    {children}
                    {/* Right-edge beta feedback tab. Hides itself on the exam
                        player and the auth pages — see FeedbackTab. */}
                    <FeedbackTab />
                    {/* "Need help?" — Limon, on demand, on every page that has a
                        tour. Hides itself on the exam player for the same reason
                        the feedback tab does. */}
                    <LimonHelp />
                    {/* Brings any error banner into view + announces it. */}
                    <ScrollToError />
                </ThemeProvider>
            </body>
        </html>
    );
}
