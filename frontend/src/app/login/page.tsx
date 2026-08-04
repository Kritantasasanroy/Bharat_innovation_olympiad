'use client';

import { APP_NAME, COMPANY_NAME, SMS_OTP_ENABLED, TAGLINE } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emailOtp, isValidPhone, phoneOtp } from '@/lib/auth-client';
import { FormEvent, useState } from 'react';

type Step = 'identifier' | 'otp';
type Method = 'email' | 'phone';

export default function LoginPage() {
    const [step, setStep] = useState<Step>('identifier');
    const [method, setMethod] = useState<Method>('email');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const loginWithEmail = useAuthStore((s) => s.loginWithEmail);
    const loginWithPhone = useAuthStore((s) => s.loginWithPhone);
    const router = useRouter();

    const isPhone = method === 'phone';
    const identifier = isPhone ? phone : email;
    // With SMS off, phone sign-in only ever uses voice — there is no SMS
    // fallback button to fall back *to*, so this is the one channel value
    // phone sign-in uses everywhere: initial send, resend, and the (now sole)
    // submit button.
    const phoneChannel: 'sms' | 'voice' = SMS_OTP_ENABLED ? 'sms' : 'voice';

    /** Send the code by SMS (default) or an automated voice call. */
    const sendCode = async (channel: 'sms' | 'voice' = 'sms') => {
        return isPhone ? phoneOtp.sendOtp(phone, channel) : emailOtp.sendSignInOtp(email);
    };

    // Step 1: Send OTP — `channel` only matters for phone sign-in.
    const submitIdentifier = async (channel: 'sms' | 'voice') => {
        setError('');
        if (isPhone && !isValidPhone(phone)) {
            setError('Enter a valid mobile number.');
            return;
        }
        setIsLoading(true);
        try {
            const { error: otpError } = await sendCode(channel);
            if (otpError) {
                setError(
                    otpError.message ||
                    `Failed to send code. Make sure this ${isPhone ? 'number' : 'email'} is registered.`,
                );
            } else {
                setSuccess(
                    isPhone && channel === 'voice'
                        ? `Calling ${identifier} now with your 6-digit code…`
                        : `A 6-digit code has been sent to ${identifier}`,
                );
                setStep('otp');
            }
        } catch (err: any) {
            console.error('Send OTP error:', err);
            setError('Network error. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendOtp = async (e: FormEvent) => {
        e.preventDefault();
        await submitIdentifier(phoneChannel);
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
            if (isPhone) {
                // The phone code is verified by our backend as part of signing
                // in — there is no separate verify step to run first.
                await loginWithPhone(phone, otp);
            } else {
                const { error: signInError } = await emailOtp.signIn(email, otp);
                if (signInError) {
                    setError(signInError.message || 'Invalid or expired code. Please try again.');
                    setIsLoading(false);
                    return;
                }
                await loginWithEmail(email);
            }
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
            const { error: otpError } = await sendCode(phoneChannel);
            if (otpError) {
                setError(otpError.message || 'Failed to resend code.');
            } else {
                setSuccess(`A new code has been sent to your ${isPhone ? 'phone' : 'email'}.`);
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const switchMethod = (next: Method) => {
        setMethod(next);
        setError('');
        setSuccess('');
    };

    return (
        <div className="auth-page">
            <div style={{ position: 'fixed', top: 'var(--space-4)', right: 'var(--space-4)', zIndex: 100 }}>
                <ThemeToggle />
            </div>

            <div className="auth-container animate-fade-in">
                <div className="auth-header">
                    <div className="auth-logo"><img src="/bio-logo.png" alt={APP_NAME} style={{ height: '72px', width: 'auto' }} /></div>
                    <p className="brand-tagline"><span>{TAGLINE}</span></p>
                    <h1 className="auth-title">{APP_NAME}</h1>
                    <p className="auth-company">
                        <span>by</span>
                        <img src="/lemon-ideas-logo.png" alt={COMPANY_NAME} style={{ height: '18px', width: 'auto' }} />
                    </p>
                    <p className="auth-subtitle">
                        {step === 'identifier' ? 'Sign in to your account' : 'Enter verification code'}
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

                {step === 'identifier' ? (
                    <form onSubmit={handleSendOtp} className="auth-form">
                        {/* TEMPORARILY DISABLED — Mobile sign-in.
                            Phone sign-in depends on OTP delivery (SMS is off via
                            SMS_OTP_ENABLED; voice is the fallback), and it's being
                            hidden from the login page for now rather than left
                            visible while that's sorted out. `method` defaults to
                            'email' and nothing below can switch it away from that
                            with this tablist gone, so the whole isPhone branch
                            further down is unreachable but left intact.
                            To restore: uncomment this block. */}
                        {/*
                        <div
                            role="tablist"
                            aria-label="Sign-in method"
                            style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem',
                                background: 'var(--bg-tertiary, rgba(127,127,127,0.12))',
                                borderRadius: '10px', padding: '0.25rem', marginBottom: '1.25rem',
                            }}
                        >
                            {(['email', 'phone'] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    role="tab"
                                    aria-selected={method === m}
                                    onClick={() => switchMethod(m)}
                                    className="btn"
                                    style={{
                                        padding: '0.6rem 0.5rem', borderRadius: '8px', fontSize: '0.9rem',
                                        fontWeight: 600, border: 'none',
                                        background: method === m ? 'var(--color-primary)' : 'transparent',
                                        color: method === m ? '#fff' : 'var(--text-secondary)',
                                    }}
                                >
                                    {m === 'email' ? 'Email' : 'Mobile'}
                                </button>
                            ))}
                        </div>
                        */}

                        {isPhone ? (
                            <div className="input-group">
                                <label className="input-label" htmlFor="student-phone">Mobile Number</label>
                                <input
                                    id="student-phone"
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    className="input-field"
                                    placeholder="+91 98765 43210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    required
                                    suppressHydrationWarning
                                />
                                {/* SMS delivery is temporarily down (SMS_OTP_ENABLED),
                                    so a student who has always signed in by text needs
                                    to know a call is coming instead, not that
                                    something is broken. */}
                                {!SMS_OTP_ENABLED && (
                                    <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                        📞 SMS codes are temporarily unavailable — we&apos;ll call you with your code instead.
                                    </p>
                                )}
                            </div>
                        ) : (
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
                        )}
                        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading}>
                            {isLoading
                                ? 'Sending Code...'
                                : !isPhone
                                    ? 'Send Verification Code →'
                                    : SMS_OTP_ENABLED
                                        ? 'Send Code by SMS →'
                                        : 'Call Me With the Code →'}
                        </button>
                        {/* The voice fallback is only a *fallback* — its own button
                            below the primary — while SMS is the default. With SMS
                            off, the primary button already calls, so a second
                            "call me" button here would just be the same action
                            twice. */}
                        {isPhone && SMS_OTP_ENABLED && (
                            <button
                                type="button"
                                className="btn auth-submit"
                                onClick={() => submitIdentifier('voice')}
                                disabled={isLoading}
                                style={{
                                    marginTop: '0.6rem',
                                    background: 'transparent',
                                    border: '1px solid var(--border-color, rgba(127,127,127,0.35))',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                📞 Get the code by call instead
                            </button>
                        )}
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp} className="auth-form">
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
                            Enter the 6-digit code sent to <strong>{identifier}</strong>
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
                                onClick={() => { setStep('identifier'); setOtp(''); setError(''); setSuccess(''); }}
                                className="btn"
                                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0.5rem' }}
                            >
                                {isPhone ? '← Change number' : '← Change email'}
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
