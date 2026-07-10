'use client';

import { APP_NAME, CLASS_BANDS, COMPANY_NAME } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emailOtp } from '@/lib/auth-client';
import { captureReferralFromUrl, clearReferralCode, getReferralCode } from '@/lib/referral';
import SchoolPicker from '@/components/SchoolPicker';
import type { DirectorySchool } from '@/lib/schools';
import { FormEvent, useState, useEffect } from 'react';

type Step = 'details' | 'verify' | 'face';

export default function RegisterPage() {
    const [step, setStep] = useState<Step>('details');
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: 'STUDENT' as const,
        classBand: 6,
    });
    const [school, setSchool] = useState<DirectorySchool | null>(null);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const register = useAuthStore((s) => s.register);
    const router = useRouter();

    // Mandatory face enrollment (step 3, after account creation)
    const [faceCameraOn, setFaceCameraOn] = useState(false);
    const [faceCapturing, setFaceCapturing] = useState(false);
    const [faceMsg, setFaceMsg] = useState('');
    const {
        videoRef,
        isLoaded: modelsLoaded,
        loadingProgress,
        startEnrollmentCamera,
        stopProctoring,
        captureDescriptor,
        enrollFace,
    } = useFaceProctor({ attemptId: 'enrollment', disabled: false });

    const handleStartFaceCapture = async () => {
        setFaceMsg('Loading face detection models…');
        setFaceCameraOn(true);
        try {
            await startEnrollmentCamera();
            setFaceMsg('Position your face in the frame and click Capture.');
        } catch {
            setFaceCameraOn(false);
            setFaceMsg('Could not access camera. Please allow camera permissions and try again.');
        }
    };

    const handleCaptureFace = async () => {
        setFaceCapturing(true);
        setFaceMsg('Capturing…');
        const descriptor = await captureDescriptor();
        if (!descriptor) {
            setFaceCapturing(false);
            setFaceMsg('No face detected. Ensure your face is clearly visible and try again.');
            return;
        }
        const ok = await enrollFace(descriptor);
        stopProctoring();
        setFaceCapturing(false);
        if (ok) {
            router.push('/dashboard');
        } else {
            setFaceMsg('Enrollment failed. Please try again.');
        }
    };

    // A partner may link straight here (`/register?ref=CODE`).
    useEffect(() => {
        captureReferralFromUrl();
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
            // A partner referral code (`?ref=`) rides along so the backend can
            // credit the signup — and later the paid conversion — to that partner.
            const referralCode = getReferralCode();
            await register({
                ...formData,
                ...(school ? { schoolCode: school.code } : {}),
                ...(referralCode ? { referralCode } : {}),
            });
            clearReferralCode();

            // Account created — face enrollment is mandatory for new students
            // before they can reach the dashboard.
            setStep('face');
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
                <ThemeToggle />
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
                        {step === 'details' ? 'Create your student account' : step === 'verify' ? 'Verify your email' : 'One last step — enroll your face'}
                    </p>
                </div>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#16a34a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem' }}>{success}</div>}

                {step === 'face' ? (
                    <div className="auth-form">
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', textAlign: 'center', fontSize: '0.9rem' }}>
                            Face ID is required for AI-proctored exams. Your face is stored as an encrypted numeric descriptor — no photo is saved.
                            This step cannot be skipped.
                        </p>

                        {faceMsg && (
                            <div style={{
                                padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center',
                                background: faceMsg.startsWith('No face') || faceMsg.startsWith('Enrollment failed') || faceMsg.startsWith('Could not access')
                                    ? 'rgba(239,68,68,0.12)' : 'var(--bg-elevated)',
                                color: faceMsg.startsWith('No face') || faceMsg.startsWith('Enrollment failed') || faceMsg.startsWith('Could not access')
                                    ? '#dc2626' : 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                            }}>
                                {faceMsg}
                            </div>
                        )}

                        {faceCameraOn && (
                            <div style={{ position: 'relative', margin: '0 auto 1.25rem', borderRadius: '12px', overflow: 'hidden', background: '#000', maxWidth: '320px' }}>
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} />
                                <div style={{ position: 'absolute', inset: 0, border: '2px solid var(--primary-400)', borderRadius: '12px', pointerEvents: 'none' }} />
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                            {!faceCameraOn ? (
                                <button type="button" className="btn btn-primary btn-lg auth-submit" onClick={handleStartFaceCapture}>
                                    Enable Camera & Enroll Face
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-lg auth-submit"
                                    onClick={handleCaptureFace}
                                    disabled={faceCapturing || !modelsLoaded}
                                >
                                    {faceCapturing ? 'Saving…' : modelsLoaded ? 'Capture & Finish' : loadingProgress || 'Loading models…'}
                                </button>
                            )}
                        </div>
                    </div>
                ) : step === 'details' ? (
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

                        <SchoolPicker value={school} onChange={setSchool} />

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
