'use client';

import { useThemeStore } from '@/store/themeStore';
import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const setTheme = useThemeStore((s) => s.setTheme);

    useEffect(() => {
        const saved = localStorage.getItem('bio-theme') as 'dark' | 'light' | null;
        const preferred = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        setTheme(preferred);
    }, [setTheme]);

    return <>{children}</>;
}
