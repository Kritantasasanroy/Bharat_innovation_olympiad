'use client';

import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
