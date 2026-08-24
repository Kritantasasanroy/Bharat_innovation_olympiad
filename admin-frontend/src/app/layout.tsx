import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';

// `variable` (not `className`) — the design system's own `--font-sans` token
// (globals.css) resolves through this rather than next/font setting
// font-family directly, so every existing `var(--font-sans)` rule keeps working.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
    title: 'Admin Portal | Bharat Innovation Olympiad',
    description: 'Secure Administration Portal for managing exams and viewing student analytics.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" data-theme="light" suppressHydrationWarning>
            <body className={inter.variable}>
                <ThemeProvider>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
