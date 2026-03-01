import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Bharat Innovation Olympiad | by Lemon Ideas',
    description:
        'India\'s premier Innovation & STEM Olympiad for students in classes 6-12, powered by Lemon Ideas. Secure, AI-proctored online assessments.',
    keywords: ['olympiad', 'innovation', 'exam', 'India', 'students', 'STEM', 'Lemon Ideas'],
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
