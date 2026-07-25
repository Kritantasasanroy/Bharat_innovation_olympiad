'use client';

import { useThemeStore } from '@/store/themeStore';
import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const setTheme = useThemeStore((s) => s.setTheme);

    useEffect(() => {
        // Light is the platform default; a stored choice wins.
        const saved = localStorage.getItem('bio-theme') as 'dark' | 'light' | null;
        setTheme(saved ?? 'light');
    }, [setTheme]);

    return <>{children}</>;
}
