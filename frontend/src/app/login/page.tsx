'use client';

import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      // Redirect based on role
      const user = useAuthStore.getState().user;
      if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') {
        router.push('/admin/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container animate-fade-in">
        <div className="auth-header">
          <div className="auth-logo"><img src="/lemon-ideas-logo.png" alt="Lemon Ideas" style={{ height: '48px', width: 'auto' }} /></div>
          <h1 className="auth-title">{APP_NAME}</h1>
          <p className="auth-company">by {COMPANY_NAME}</p>
          <p className="auth-subtitle">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="input-group">
            <label className="input-label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="input-field"
              placeholder="you@school.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg auth-submit"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/register">Register here</Link>
        </div>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
        }
        .auth-container {
          width: 100%;
          max-width: 440px;
          padding: var(--space-10);
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
        }
        .auth-header {
          text-align: center;
          margin-bottom: var(--space-8);
        }
        .auth-logo {
          font-size: 3rem;
          margin-bottom: var(--space-3);
        }
        .auth-title {
          font-size: 1.5rem;
          font-weight: 800;
          background: var(--gradient-brand);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .auth-subtitle {
          color: var(--text-secondary);
          font-size: 0.95rem;
          margin-top: var(--space-2);
        }
        .auth-company {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-muted);
          margin-top: var(--space-1);
          letter-spacing: 0.03em;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .auth-error {
          padding: var(--space-3) var(--space-4);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--radius-md);
          color: var(--danger-400);
          font-size: 0.85rem;
          margin-bottom: var(--space-4);
        }
        .auth-submit {
          width: 100%;
          margin-top: var(--space-4);
        }
        .auth-footer {
          text-align: center;
          margin-top: var(--space-6);
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
