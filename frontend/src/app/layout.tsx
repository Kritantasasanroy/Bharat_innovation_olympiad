import FeedbackTab from '@/components/FeedbackTab';
import LimonHelp from '@/components/limon/LimonHelp';
import ScrollToError from '@/components/ScrollToError';
import ThemeProvider from '@/components/ThemeProvider';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Montserrat, Nunito } from 'next/font/google';
import { SITE_URL, canonical, siteJsonLd } from '@/lib/seo';
import './globals.css';

/**
 * Self-hosted via next/font instead of the old `@import` of Google's CSS —
 * that import was a render-blocking external request Lighthouse charged
 * ~680ms to (connection setup + the stylesheet fetch itself, before the
 * actual font files could even start downloading). next/font fetches these
 * at *build* time and serves the files from this same origin, so there's no
 * external request left at all. `display: 'optional'` is unchanged from the
 * `@import` version — still the fix for the font-swap CLS Lighthouse traced
 * to the hero heading.
 *
 * Poppins was in the old `@import` (4 weights) but grep confirms nothing in
 * this codebase ever references it — dropped rather than migrated.
 */
const inter = Inter({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700', '800', '900'],
    display: 'optional',
    variable: '--font-inter',
});
const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    display: 'optional',
    variable: '--font-jetbrains-mono',
});
const montserrat = Montserrat({
    subsets: ['latin'],
    weight: ['600', '700', '800'],
    display: 'optional',
    variable: '--font-montserrat',
});
const nunito = Nunito({
    subsets: ['latin'],
    weight: ['700', '800', '900'],
    display: 'optional',
    variable: '--font-nunito',
});

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
        'innovation challenge', 'startup contest', 'startup olympiad',
        'investment', 'funding',
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
        <html
            lang="en"
            data-theme="light"
            suppressHydrationWarning
            className={`${inter.variable} ${jetbrainsMono.variable} ${montserrat.variable} ${nunito.variable}`}
        >
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
