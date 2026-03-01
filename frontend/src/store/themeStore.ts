import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
    theme: 'dark',

    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('bio-theme', next);
        set({ theme: next });
    },

    setTheme: (t: Theme) => {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('bio-theme', t);
        set({ theme: t });
    },
}));
