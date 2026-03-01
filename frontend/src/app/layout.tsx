import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Bharat Innovation Olympiad',
    description:
        'India\'s premier Innovation Olympiad exam platform for students in classes 6-12. Secure, AI-proctored online assessments.',
    keywords: ['olympiad', 'innovation', 'exam', 'India', 'students', 'STEM'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </head>
            <body>{children}</body>
        </html>
    );
}
