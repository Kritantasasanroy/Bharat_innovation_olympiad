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
          <div className="hero-badge">
            <img src="/lemon-ideas-logo.png" alt="Lemon Ideas" style={{ height: '20px', width: 'auto' }} /> Powered by {COMPANY_NAME}
          </div>
          <h1 className="hero-title">
            <span className="gradient-text">{APP_NAME}</span>
          </h1>
          <p className="hero-subtitle">
            India&apos;s premier Innovation &amp; STEM Olympiad for students in Classes 6–12,
            by <strong>{COMPANY_NAME}</strong>. Secure, AI-proctored, and designed to challenge the brightest minds.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary btn-lg">
              Register Now
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg">
              Student Login
            </Link>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="stat-value">50K+</span>
              <span className="stat-label">Students</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">1,200+</span>
              <span className="stat-label">Schools</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">7</span>
              <span className="stat-label">Class Bands</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">AI</span>
              <span className="stat-label">Proctored</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features container">
        <h2 className="section-title">Why Choose Us</h2>
        <div className="grid-3 features-grid">
          <div className="glass-card feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Secure Exam Environment</h3>
            <p>Safe Exam Browser integration locks down the device during exams. No cheating, no shortcuts.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI Proctoring</h3>
            <p>Real-time face detection and identity verification ensures exam integrity without human proctors.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">⏱️</div>
            <h3>Server-Synced Timers</h3>
            <p>Tamper-proof timers synced from our servers. Per-question timing ensures fairness for all.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">📊</div>
            <h3>Instant Analytics</h3>
            <p>Detailed performance reports with topic-wise analysis, percentile rankings, and improvement tips.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🎮</div>
            <h3>Gamified Learning</h3>
            <p>Earn XP, build streaks, and climb leaderboards. Learning innovation has never been this engaging.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🏫</div>
            <h3>School Portal</h3>
            <p>Schools can register students in bulk, monitor performance, and access aggregate analytics.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 {COMPANY_NAME} &mdash; {APP_NAME}. All rights reserved.</p>
        </div>
      </footer>

      
    </div>
  );
}
