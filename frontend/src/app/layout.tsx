import FeedbackTab from '@/components/FeedbackTab';
import ThemeProvider from '@/components/ThemeProvider';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    // Needed to turn the relative openGraph image below into an absolute URL.
    // Without it Next falls back to localhost:3000 and warns at build time.
    metadataBase: new URL(
        process.env.NEXT_PUBLIC_SITE_URL || 'https://exam.bharatolympiad.in',
    ),
    title: 'Bharat Innovation Olympiad | Become Future Ready',
    description:
        'Discover your potential beyond academics by developing the mindset, skills and awareness ' +
        'to innovate, solve real-world problems and confidently shape the future of India and the world. ' +
        'For students in Grades 6–12, by Lemon Ideas.',
    keywords: [
        'olympiad', 'innovation', 'future ready', 'entrepreneurship', 'STEM',
        'exam', 'India', 'students', 'Lemon Ideas', 'Viksit Bharat',
    ],
    icons: { icon: '/icon.png', apple: '/icon.png' },
    openGraph: {
        title: 'Bharat Innovation Olympiad: Become Future Ready',
        description:
            'India\'s innovation and future-skills olympiad for Grades 6–12. Assessed across five ' +
            'future-focused dimensions, not memorisation.',
        siteName: 'Bharat Innovation Olympiad',
        type: 'website',
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
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {/* `metadata.icons` above emits the link tag. The hand-written
                    /favicon.ico this used to reference did not exist and 404'd. */}
            </head>
            <body>
                <ThemeProvider>
                    {children}
                    {/* Right-edge beta feedback tab. Hides itself on the exam
                        player and the auth pages — see FeedbackTab. */}
                    <FeedbackTab />
                </ThemeProvider>
            </body>
        </html>
    );
}
