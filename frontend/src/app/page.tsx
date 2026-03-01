'use client';

import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="page-wrapper">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="container hero-content">
          <div className="hero-badge">
            <span>🍋</span> Powered by {COMPANY_NAME}
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

      <style jsx>{`
        .hero {
          position: relative;
          padding: var(--space-16) 0;
          min-height: 80vh;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .hero-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 50% 20%, rgba(251, 197, 11, 0.12), transparent),
            radial-gradient(ellipse 40% 40% at 80% 60%, rgba(0, 154, 78, 0.08), transparent),
            radial-gradient(ellipse 40% 40% at 20% 80%, rgba(255, 165, 0, 0.06), transparent);
          animation: pulseGlow 8s ease-in-out infinite alternate;
        }
        @keyframes pulseGlow {
          0% { opacity: 0.7; }
          100% { opacity: 1; }
        }
        .hero-content {
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          background: rgba(251, 197, 11, 0.1);
          border: 1px solid rgba(251, 197, 11, 0.2);
          border-radius: var(--radius-full);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--primary-400);
          margin-bottom: var(--space-6);
        }
        .hero-title {
          font-size: 3.5rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          margin-bottom: var(--space-6);
          line-height: 1.1;
        }
        .gradient-text {
          background: var(--gradient-brand);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-subtitle {
          font-size: 1.2rem;
          color: var(--text-secondary);
          max-width: 640px;
          margin: 0 auto var(--space-8);
          line-height: 1.7;
        }
        .hero-actions {
          display: flex;
          gap: var(--space-4);
          justify-content: center;
          margin-bottom: var(--space-12);
        }
        .hero-stats {
          display: flex;
          gap: var(--space-10);
          justify-content: center;
          padding-top: var(--space-8);
          border-top: 1px solid var(--border-subtle);
          max-width: 600px;
          margin: 0 auto;
        }
        .hero-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .features {
          padding: var(--space-16) var(--space-6);
        }
        .section-title {
          text-align: center;
          margin-bottom: var(--space-10);
          font-size: 2rem;
        }
        .features-grid {
          max-width: 1100px;
          margin: 0 auto;
        }
        .feature-card {
          padding: var(--space-8);
          text-align: center;
        }
        .feature-icon {
          font-size: 2.5rem;
          margin-bottom: var(--space-4);
        }
        .feature-card h3 {
          margin-bottom: var(--space-3);
          font-size: 1.1rem;
        }
        .feature-card p {
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.6;
        }
        .footer {
          padding: var(--space-8) 0;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.85rem;
          border-top: 1px solid var(--border-subtle);
          margin-top: auto;
        }
      `}</style>
    </div>
  );
}
