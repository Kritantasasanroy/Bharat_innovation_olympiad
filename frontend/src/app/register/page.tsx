'use client';

import { APP_NAME, CLASS_BANDS, COMPANY_NAME } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emailOtp } from '@/lib/auth-client';
import { FormEvent, useState, useRef, useEffect } from 'react';
import schoolsData from '@/data/schools.json';

const SCHOOLS = (schoolsData as any[]).map((s: any) => ({
    code: `SCH${String(s['Sr.']).padStart(3, '0')}`,
    name: s['School Name'],
    address: s['Address'],
    pincode: s['Pincode'] ? String(s['Pincode']).trim() : ''
}));

type Step = 'details' | 'verify';

export default function RegisterPage() {
    const [step, setStep] = useState<Step>('details');
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: 'STUDENT' as const,
        classBand: 6,
        schoolCode: '',
    });
    const [otp, setOtp] = useState('');
    const [schoolSearch, setSchoolSearch] = useState('');
    const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const register = useAuthStore((s) => s.register);
    const router = useRouter();
    const { theme, toggleTheme } = useThemeStore();

    const filteredSchools = SCHOOLS.filter(s =>
        s.name.toLowerCase().includes(schoolSearch.toLowerCase())
    );

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowSchoolDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.name === 'classBand' ? parseInt(e.target.value) : e.target.value,
        }));
    };

    // Step 1: Send OTP to email
    const handleSendOtp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (!formData.firstName.trim() || !formData.lastName.trim()) {
            setError('Please enter your full name.');
            return;
        }
        if (!formData.email.trim()) {
            setError('Please enter your email address.');
            return;
        }
        setIsLoading(true);
        try {
            const { error: otpError } = await emailOtp.sendVerificationOtp(formData.email);
            if (otpError) {
                setError(otpError.message || 'Failed to send OTP. Please try again.');
            } else {
                setSuccess(`A 6-digit code has been sent to ${formData.email}`);
                setStep('verify');
            }
        } catch (err: any) {
            console.error('Send OTP error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Verify OTP and create account
    const handleVerifyOtp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) {
            setError('Please enter the 6-digit code.');
            return;
        }
        setIsLoading(true);
        try {
            // Verify the OTP via Neon Auth
            const { error: verifyError } = await emailOtp.verifyEmail(formData.email, otp);
            if (verifyError) {
                setError(verifyError.message || 'Invalid or expired code. Please try again.');
                setIsLoading(false);
                return;
            }

            // OTP verified ✓ — now create the user in our backend.
            // /auth/sync is a public endpoint that takes email in the body.
            const { schoolCode, ...profileData } = formData;
            await register({ ...profileData, ...(schoolCode ? { schoolCode } : {}) });

            router.push('/dashboard');
        } catch (err: any) {
            console.error('Verify OTP error:', err);
            setError(err?.response?.data?.message || err?.message || 'Account creation failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setError('');
        setSuccess('');
        setIsLoading(true);
        try {
            const { error: otpError } = await emailOtp.sendVerificationOtp(formData.email);
            if (otpError) {
                setError(otpError.message || 'Failed to resend OTP.');
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
                    <div className="auth-logo"><img src="/lemon-ideas-logo.png" alt="Lemon Ideas" style={{ height: '48px', width: 'auto' }} /></div>
                    <h1 className="auth-title">{APP_NAME}</h1>
                    <p className="auth-company">by {COMPANY_NAME}</p>
                    <p className="auth-subtitle">
                        {step === 'details' ? 'Create your student account' : 'Verify your email'}
                    </p>
                </div>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#16a34a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem' }}>{success}</div>}

                {step === 'details' ? (
                    <form onSubmit={handleSendOtp} className="auth-form">
                        <div className="form-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="firstName">First Name</label>
                                <input
                                    id="firstName" name="firstName" type="text" className="input-field"
                                    placeholder="Aarav" value={formData.firstName}
                                    onChange={handleChange} required
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="lastName">Last Name</label>
                                <input
                                    id="lastName" name="lastName" type="text" className="input-field"
                                    placeholder="Sharma" value={formData.lastName}
                                    onChange={handleChange} required
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="email">Email Address</label>
                            <input
                                id="email" name="email" type="email" className="input-field"
                                placeholder="you@example.com" value={formData.email}
                                onChange={handleChange} required suppressHydrationWarning
                            />
                        </div>

                        <div className="form-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="classBand">Class</label>
                                <select
                                    id="classBand" name="classBand" className="input-field"
                                    value={formData.classBand} onChange={handleChange}
                                >
                                    {CLASS_BANDS.map((c) => (
                                        <option key={c} value={c}>Class {c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group" ref={dropdownRef} style={{ position: 'relative' }}>
                                <label className="input-label" htmlFor="schoolSearch">School <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                                <input
                                    id="schoolSearch" type="text" className="input-field"
                                    placeholder="Search school or leave blank"
                                    value={schoolSearch}
                                    onChange={(e) => {
                                        setSchoolSearch(e.target.value);
                                        setShowSchoolDropdown(true);
                                        if (formData.schoolCode) setFormData(prev => ({ ...prev, schoolCode: '' }));
                                    }}
                                    onFocus={() => setShowSchoolDropdown(true)}
                                />
                                {showSchoolDropdown && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                                        borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px'
                                    }}>
                                        {filteredSchools.length > 0 ? filteredSchools.map(school => (
                                            <div
                                                key={school.code}
                                                style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '2px' }}
                                                onClick={() => {
                                                    setSchoolSearch(school.name);
                                                    setFormData(prev => ({ ...prev, schoolCode: school.code }));
                                                    setShowSchoolDropdown(false);
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <span style={{ fontWeight: 500 }}>{school.name}</span>
                                                {(school.address || school.pincode) && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                        {school.address}{school.address && school.pincode ? ', ' : ''}{school.pincode}
                                                    </span>
                                                )}
                                            </div>
                                        )) : (
                                            <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                                                No schools found. Leave blank for Independent.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading}>
                            {isLoading ? 'Sending Code...' : 'Send Verification Code →'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp} className="auth-form">
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
                            Enter the 6-digit code sent to <strong>{formData.email}</strong>
                        </p>

                        <div className="input-group">
                            <label className="input-label" htmlFor="otp">Verification Code</label>
                            <input
                                id="otp" name="otp" type="text" inputMode="numeric" className="input-field"
                                placeholder="000000" value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                required maxLength={6}
                                style={{ letterSpacing: '0.5rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 600 }}
                                autoFocus
                            />
                        </div>

                        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading || otp.length < 6}>
                            {isLoading ? 'Verifying...' : 'Verify & Create Account'}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={() => { setStep('details'); setOtp(''); setError(''); setSuccess(''); }}
                                className="btn"
                                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0.5rem' }}
                            >
                                ← Change details
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
                        Already have an account? <Link href="/login">Sign in</Link>
                    </div>
                    <Link href="/" style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        ← Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
