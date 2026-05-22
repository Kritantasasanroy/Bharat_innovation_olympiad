'use client';

import { APP_NAME, COMPANY_NAME } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emailOtp } from '@/lib/auth-client';
import { FormEvent, useState } from 'react';

type Step = 'email' | 'otp';

export default function LoginPage() {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const loginWithEmail = useAuthStore((s) => s.loginWithEmail);
    const router = useRouter();
    const { theme, toggleTheme } = useThemeStore();

    // Step 1: Send OTP
    const handleSendOtp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const { error: otpError } = await emailOtp.sendSignInOtp(email);
            if (otpError) {
                setError(otpError.message || 'Failed to send code. Make sure this email is registered.');
            } else {
                setSuccess(`A 6-digit code has been sent to ${email}`);
                setStep('otp');
            }
        } catch (err: any) {
            console.error('Send OTP error:', err);
            setError('Network error. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Verify OTP and sign in
    const handleVerifyOtp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) {
            setError('Please enter the 6-digit code.');
            return;
        }
        setIsLoading(true);
        try {
            // Verify OTP with Neon Auth
            const { error: signInError } = await emailOtp.signIn(email, otp);
            if (signInError) {
                setError(signInError.message || 'Invalid or expired code. Please try again.');
                setIsLoading(false);
                return;
            }

            // OTP verified ✓ — exchange email for our own JWT via /auth/login-sync
            await loginWithEmail(email);
            router.push('/dashboard');
        } catch (err: any) {
            console.error('OTP sign in error:', err);
            const msg = err?.response?.data?.message || err?.message || '';
            if (msg.toLowerCase().includes('no account')) {
                setError('No account found. Please register first.');
            } else {
                setError(msg || 'Sign in failed. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            const { error: otpError } = await emailOtp.sendSignInOtp(email);
            if (otpError) {
                setError(otpError.message || 'Failed to resend code.');
            } else {
                setSuccess('A new code has been sent to your email.');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div style={{ position: 'fixed', top: 'var(--space-4)', right: 'var(--space-4)', zIndex: 100 }}>
                <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>

            <div className="auth-container animate-fade-in">
                <div className="auth-header">
                    <div className="auth-logo"><img src="/bio-logo.png" alt={APP_NAME} style={{ height: '72px', width: 'auto' }} /></div>
                    <p className="brand-tagline"><span>Where Young Minds Build the Future</span></p>
                    <h1 className="auth-title">{APP_NAME}</h1>
                    <p className="auth-company">
                        <span>by</span>
                        <img src="/lemon-ideas-logo.png" alt={COMPANY_NAME} style={{ height: '18px', width: 'auto' }} />
                    </p>
                    <p className="auth-subtitle">
                        {step === 'email' ? 'Sign in to your account' : 'Enter verification code'}
                    </p>
                </div>

                {error && <div className="auth-error">{error}</div>}
                {success && (
                    <div style={{
                        background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                        color: '#16a34a', borderRadius: '8px', padding: '0.75rem 1rem',
                        marginBottom: '1rem', fontSize: '0.9rem'
                    }}>
                        {success}
                    </div>
                )}

                {step === 'email' ? (
                    <form onSubmit={handleSendOtp} className="auth-form">
                        <div className="input-group">
                            <label className="input-label" htmlFor="student-email">Email Address</label>
                            <input
                                id="student-email"
                                type="email"
                                className="input-field"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                suppressHydrationWarning
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading}>
                            {isLoading ? 'Sending Code...' : 'Send Verification Code →'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp} className="auth-form">
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
                            Enter the 6-digit code sent to <strong>{email}</strong>
                        </p>
                        <div className="input-group">
                            <label className="input-label" htmlFor="otp">Verification Code</label>
                            <input
                                id="otp"
                                type="text"
                                inputMode="numeric"
                                className="input-field"
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                required
                                maxLength={6}
                                style={{ letterSpacing: '0.5rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 600 }}
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading || otp.length < 6}>
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={() => { setStep('email'); setOtp(''); setError(''); setSuccess(''); }}
                                className="btn"
                                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0.5rem' }}
                            >
                                ← Change email
                            </button>
                            <button
                                type="button"
                                onClick={handleResendOtp}
                                disabled={isLoading}
                                className="btn"
                                style={{ background: 'transparent', color: 'var(--color-primary)', padding: '0.5rem' }}
                            >
                                Resend code
                            </button>
                        </div>
                    </form>
                )}

                <div className="auth-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                    <div>
                        Don&apos;t have an account?{' '}
                        <Link href="/register">Register here</Link>
                    </div>
                    <Link href="/" style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        ← Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
