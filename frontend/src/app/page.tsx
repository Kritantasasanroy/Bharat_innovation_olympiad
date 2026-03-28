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
            <div className="feature-icon">🚀</div>
            <h3>Ignite Entrepreneurship</h3>
            <p>Step into the startup world early. Validate your creative visions, build school projects into business models, and learn the fundamentals of venture creation.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">💡</div>
            <h3>Innovation by EveryONE</h3>
            <p>Guided by Lemon Ideas&apos; core mission to cultivate a mindset of co-creation, self-reliance, and sustainable living for the next generation of problem solvers.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🤝</div>
            <h3>Mentorship &amp; Ecosystem</h3>
            <p>Don&apos;t just test your knowledge. Gain access to a self-sustaining ecosystem of active mentors, domain experts, and real-world founders.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🏆</div>
            <h3>Innopreneurs Platform</h3>
            <p>Your stepping stone to the prestigious Innopreneurs Global Startup Contest—a premier stage offering incubation, networking, and acceleration.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🎓</div>
            <h3>Experiential Learning</h3>
            <p>Moving beyond traditional textbook metrics, our AI-evaluated platform tests real-world application, critical thinking, and “learning by doing”.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🤖</div>
            <h3>Fair &amp; AI Proctored</h3>
            <p>100% fair, transparent, and secure evaluations powered by advanced face detection, ensuring merit and integrity across the nation.</p>
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
