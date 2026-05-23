'use client';

import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useThemeStore } from '@/store/themeStore';
import Link from 'next/link';

export default function HomePage() {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <div className="page-wrapper">
      {/* Theme toggle - top right */}
      <div style={{ position: 'fixed', top: 'var(--space-4)', right: 'var(--space-4)', zIndex: 100 }}>
        <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="container hero-content">
          <img src="/bio-logo.png" alt={APP_NAME} className="hero-logo" />
          <p className="brand-tagline"><span>Where Young Minds Build the Future</span></p>
          <h1 className="hero-title">
            <span className="gradient-text">{APP_NAME}</span>
          </h1>
          <div className="hero-badge">
            <img src="/lemon-ideas-logo.png" alt={COMPANY_NAME} style={{ height: '20px', width: 'auto' }} /> Powered by {COMPANY_NAME}
          </div>
          <p className="hero-subtitle">
            India&apos;s premier Innovation &amp; Entrepreneurship Olympiad for students,
            by <strong>{COMPANY_NAME}</strong>. A definitive platform designed to discover young innovators, nurture startup ideas, and give teenagers a global stage to shine in entrepreneurship and experiential learning.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary btn-lg">
              Register Now
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg">
              Student Login
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
