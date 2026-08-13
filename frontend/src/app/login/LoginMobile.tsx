'use client';

import { APP_NAME, TAGLINE } from '@/lib/constants';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';
import { FormEvent } from 'react';

type Step = 'identifier' | 'otp';

interface Props {
    step: Step;
    email: string;
    setEmail: (v: string) => void;
    otp: string;
    setOtp: (v: string) => void;
    error: string;
    success: string;
    isLoading: boolean;
    handleSendOtp: (e: FormEvent) => void;
    handleVerifyOtp: (e: FormEvent) => void;
    handleResendOtp: () => void;
    goBackToIdentifier: () => void;
}

/**
 * Login, as its own mobile screen.
 *
 * The desktop card (`app/login/page.tsx`) is already narrow, but it centres
 * itself with a lot of top/bottom whitespace meant for a tall viewport with
 * room to spare, and its theme toggle floats over the top-right corner of the
 * card rather than the page. On a phone keyboard sheet that whitespace is
 * the difference between the submit button being on screen or not, so this
 * lays the same two steps out full-height with the primary action pinned
 * near the thumb. All state and network calls stay owned by the page
 * component; this only renders.
 */
export default function LoginMobile({
    step, email, setEmail, otp, setOtp, error, success, isLoading,
    handleSendOtp, handleVerifyOtp, handleResendOtp, goBackToIdentifier,
}: Props) {
    return (
        <div className="mob-auth">
            <div className="mob-auth__top">
                <Link href="/" className="mob-auth__back">← Home</Link>
                <ThemeToggle />
            </div>

            <div className="mob-auth__body">
                <img src="/bio-logo.png" alt={APP_NAME} className="mob-auth__logo" />
                <p className="mob-auth__tagline">{TAGLINE}</p>
                <h1 className="mob-auth__title">
                    {step === 'identifier' ? 'Sign in' : 'Enter your code'}
                </h1>
                <p className="mob-auth__subtitle">
                    {step === 'identifier'
                        ? 'Use the email you registered with.'
                        : `We sent a 6-digit code to ${email}`}
                </p>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="mob-auth__success">{success}</div>}

                {step === 'identifier' ? (
                    <form onSubmit={handleSendOtp} className="mob-auth__form">
                        <div className="input-group">
                            <label className="input-label" htmlFor="m-login-email">Email Address</label>
                            <input
                                id="m-login-email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                className="input-field mob-auth__input"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg mob-auth__submit" disabled={isLoading}>
                            {isLoading ? 'Sending Code…' : 'Send Verification Code →'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp} className="mob-auth__form">
                        <div className="input-group">
                            <label className="input-label" htmlFor="m-login-otp">Verification Code</label>
                            <input
                                id="m-login-otp"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                className="input-field mob-auth__otp"
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                required
                                maxLength={6}
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg mob-auth__submit" disabled={isLoading || otp.length < 6}>
                            {isLoading ? 'Signing in…' : 'Sign In'}
                        </button>
                        <div className="mob-auth__row">
                            <button type="button" onClick={goBackToIdentifier} className="mob-auth__link">
                                ← Change email
                            </button>
                            <button type="button" onClick={handleResendOtp} disabled={isLoading} className="mob-auth__link">
                                Resend code
                            </button>
                        </div>
                    </form>
                )}
            </div>

            <div className="mob-auth__footer">
                Don&apos;t have an account? <Link href="/register">Register here</Link>
            </div>
        </div>
    );
}
