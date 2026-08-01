'use client';

import { APP_NAME, CLASS_BANDS, COMPANY_NAME, TAGLINE, TERMS_VERSION } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emailOtp, isValidPhone, phoneOtp } from '@/lib/auth-client';
import { captureReferralFromUrl, clearReferralCode, getReferralCode } from '@/lib/referral';
import { describeCameraError, describeError } from '@/lib/errors';
import SchoolPicker from '@/components/SchoolPicker';
import GuardianStep from './steps/GuardianStep';
import PaymentStep from './steps/PaymentStep';
import PresenceStep from './steps/PresenceStep';
import type { DirectorySchool } from '@/lib/schools';
import { FormEvent, useState, useEffect } from 'react';

/**
 * Student registration, in six steps.
 *
 * ## The order, and why it is this order
 *
 * `presence` → `details` → `verify` → `face` → `guardian` → `payment`
 *
 *  - **presence first**, before a single field: the student has to be at the
 *    keyboard for the face scan, and discovering that at step 4 is too late.
 *    It also carries the T&C acceptance, so nobody types their details before
 *    seeing what they are agreeing to.
 *  - **verify before the account exists**: the account is created at the end of
 *    `verify`, once the email is proven. Everything after that point can rely on
 *    a real, authenticated user, which is why `guardian` and `payment` can simply
 *    call authenticated endpoints.
 *  - **face before guardian**: it is the step that needs the student personally,
 *    so it happens while they are certainly still there. The parent section can
 *    be finished by a parent leaning over afterwards.
 *  - **payment last**, and mandatory: paying unlocks the dashboard and every
 *    exam. It is last because a student who abandons here still has a usable
 *    account — they land on the dashboard's locked state and can pay from there,
 *    rather than having no account at all.
 *
 * Each step lives in its own component under `./steps/`. Only `details` and
 * `verify` remain inline, because they share the form state and the OTP handshake.
 */

type Step = 'presence' | 'details' | 'verify' | 'face' | 'guardian' | 'payment';

/** Ordered, so the progress indicator and the labels derive from one list. */
const STEPS: { id: Step; label: string }[] = [
    { id: 'presence', label: 'Before you start' },
    { id: 'details', label: 'Your details' },
    { id: 'verify', label: 'Verify email' },
    { id: 'face', label: 'Face scan' },
    { id: 'payment', label: 'Payment' },
    { id: 'guardian', label: 'Parent details' },
];

const SUBTITLES: Record<Step, string> = {
    presence: 'Please read this before you begin',
    details: 'Create your student account',
    verify: 'Verify your email',
    face: 'Enrol your face',
    guardian: 'Parent or guardian details',
    payment: 'Complete your registration',
};

export default function RegisterPage() {
    const [step, setStep] = useState<Step>('presence');
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        role: 'STUDENT' as const,
        classBand: 6,
    });
    const [school, setSchool] = useState<DirectorySchool | null>(null);
    const [section, setSection] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const register = useAuthStore((s) => s.register);
    const user = useAuthStore((s) => s.user);
    const router = useRouter();

    // ── Step 0: presence + terms acknowledgements ──
    const [presenceAck, setPresenceAck] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [dataConsent, setDataConsent] = useState(false);

    // Optional mobile number, proven by an SMS code submitted with the form.
    // number is submitted — an unverified one would let a student claim someone
    // else's number and lock the real owner out of registering it.
    const [phone, setPhone] = useState('');
    const [phoneOtpCode, setPhoneOtpCode] = useState('');
    const [phoneOtpSent, setPhoneOtpSent] = useState(false);
    const [phoneBusy, setPhoneBusy] = useState(false);
    const [phoneMsg, setPhoneMsg] = useState('');

    /**
     * Registration used to be SMS-only, so a student whose network drops the
     * SMS could not create an account at all — the voice fallback existed on
     * the login page and nowhere else. Both channels are offered here now.
     */
    const handleSendPhoneOtp = async (channel: 'sms' | 'voice' = 'sms') => {
        setPhoneMsg('');
        if (!isValidPhone(phone)) {
            setPhoneMsg('Enter a valid mobile number.');
            return;
        }
        setPhoneBusy(true);
        try {
            const { error: otpError } = await phoneOtp.sendOtp(phone, channel);
            if (otpError) {
                setPhoneMsg(
                    otpError.message ||
                        (channel === 'voice'
                            ? 'Could not place the call.'
                            : 'Could not send the code. Try “Get the code by call instead”.'),
                );
            } else {
                setPhoneOtpSent(true);
                setPhoneMsg(channel === 'voice' ? 'Calling you now with the code…' : 'Code sent by SMS.');
            }
        } catch (err) {
            setPhoneMsg(describeError(err, 'send the code to your phone'));
        } finally {
            setPhoneBusy(false);
        }
    };

    // No inline verify step: the code is submitted with the form and checked
    // server-side at /auth/sync. Verifying here would consume the single-use
    // code before registration could use it.

    // Mandatory face enrollment (after account creation)
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
        } catch (err) {
            setFaceCameraOn(false);
            setFaceMsg(describeCameraError(err));
        }
    };

    const handleCaptureFace = async () => {
        setFaceCapturing(true);
        setFaceMsg('Capturing…');
        const descriptor = await captureDescriptor();
        if (!descriptor) {
            setFaceCapturing(false);
            setFaceMsg(
                "We couldn't see a face in the picture. Sit facing the camera in good light, with nothing covering your face, then capture again.",
            );
            return;
        }
        const ok = await enrollFace(descriptor);
        stopProctoring();
        setFaceCapturing(false);
        if (ok) {
            // Face enrolled — proceed to payment, then parent consent follows.
            setStep('payment');
        } else {
            setFaceMsg(
                "We couldn't save your face scan. Make sure your whole face is lit and in frame, then capture again.",
            );
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

    // Step: send OTP to email
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
        // School is required — checked here as well as server-side so the student
        // is told before an OTP is spent rather than after.
        if (!school) {
            setError('Please choose your school. Search for it, enter a school code, or add it.');
            return;
        }
        setIsLoading(true);
        try {
            const { error: otpError } = await emailOtp.sendVerificationOtp(formData.email);
            if (otpError) {
                setError(
                    otpError.message ||
                        "We couldn't send the code to that email address. Check it is spelled correctly, then try again.",
                );
            } else {
                setSuccess(`A 6-digit code has been sent to ${formData.email}`);
                setStep('verify');
            }
        } catch (err: any) {
            console.error('Send OTP error:', err);
            setError(describeError(err, 'send your verification code'));
        } finally {
            setIsLoading(false);
        }
    };

    // Step: verify OTP and create account
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
                setError(
                    verifyError.message ||
                        "That code didn't work. Codes expire after a few minutes — use “Resend code” to get a fresh one, and check your spam folder.",
                );
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
                ...(section.trim() ? { section: section.trim() } : {}),
                // The version actually shown on the presence step, so a later
                // revision is distinguishable from what was agreed to.
                termsVersion: TERMS_VERSION,
                ...(referralCode ? { referralCode } : {}),
                // Both, or neither — the backend rejects a phone without a code.
                ...(phone.trim() && phoneOtpCode.length === 6
                    ? { phone, phoneCode: phoneOtpCode }
                    : {}),
            });
            clearReferralCode();
            setSuccess('');

            // Account created — face enrollment is mandatory for new students.
            setStep('face');
        } catch (err: any) {
            console.error('Verify OTP error:', err);
            setError(describeError(err, 'create your account'));
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
                setError(otpError.message || "We couldn't send another code just now. Wait a moment and try again.");
            } else {
                setSuccess('A new code has been sent to your email.');
            }
        } catch (err) {
            setError(describeError(err, 'send another code'));
        } finally {
            setIsLoading(false);
        }
    };

    const stepIndex = STEPS.findIndex((s) => s.id === step);
    // The account exists from `face` onwards, so leaving is no longer destructive.
    const accountExists = stepIndex >= STEPS.findIndex((s) => s.id === 'face');

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
                    <p className="auth-subtitle">{SUBTITLES[step]}</p>
                </div>

                {/* Progress — six steps is enough that "am I nearly done?" needs answering. */}
                <ol className="register-progress" aria-label="Registration progress">
                    {STEPS.map((s, i) => (
                        <li
                            key={s.id}
                            className={
                                i < stepIndex
                                    ? 'register-progress__step is-done'
                                    : i === stepIndex
                                      ? 'register-progress__step is-current'
                                      : 'register-progress__step'
                            }
                            aria-current={i === stepIndex ? 'step' : undefined}
                        >
                            <span className="register-progress__dot">{i < stepIndex ? '✓' : i + 1}</span>
                            <span className="register-progress__label">{s.label}</span>
                        </li>
                    ))}
                </ol>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success">{success}</div>}

                {step === 'presence' ? (
                    <PresenceStep
                        acknowledged={presenceAck}
                        onAcknowledgedChange={setPresenceAck}
                        termsAccepted={termsAccepted}
                        onTermsAcceptedChange={setTermsAccepted}
                        dataConsent={dataConsent}
                        onDataConsentChange={setDataConsent}
                        onContinue={() => { setError(''); setStep('details'); }}
                    />
                ) : step === 'payment' ? (
                    <PaymentStep
                        studentEmail={user?.email ?? formData.email}
                        rollNumber={user?.rollNumber}
                        onDone={() => { setError(''); setStep('guardian'); }}
                    />
                ) : step === 'guardian' ? (
                    <GuardianStep
                        studentName={`${formData.firstName} ${formData.lastName}`.trim() || undefined}
                        onDone={() => router.push('/feedback/registration')}
                    />
                ) : step === 'face' ? (
                    <div className="auth-form">
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', textAlign: 'center', fontSize: '0.9rem' }}>
                            Face ID is required for AI-proctored exams. Your face is stored as an encrypted numeric descriptor — no photo is saved.
                            This step cannot be skipped, and <strong>the student must do it themselves</strong>.
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
                                    {faceCapturing ? 'Saving…' : modelsLoaded ? 'Capture & Continue' : loadingProgress || 'Loading models…'}
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
                            <label className="input-label" htmlFor="phone">
                                Mobile Number <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional — lets you sign in by OTP)</span>
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel"
                                    className="input-field" placeholder="+91 98765 43210"
                                    value={phone}
                                    onChange={(e) => { setPhone(e.target.value); setPhoneOtpSent(false); setPhoneMsg(''); }}
                                    suppressHydrationWarning
                                />
                                <button
                                    type="button" className="btn"
                                    onClick={() => handleSendPhoneOtp('sms')}
                                    disabled={phoneBusy || !phone.trim()}
                                    style={{ whiteSpace: 'nowrap', background: 'var(--bg-tertiary, rgba(127,127,127,0.15))', color: 'var(--text-primary)' }}
                                >
                                    {phoneOtpSent ? 'Resend' : 'Send code'}
                                </button>
                            </div>

                            {/* The SMS route can be blocked by the carrier with no
                                signal to us, so the call fallback is always offered
                                rather than only appearing after a failure. */}
                            <button
                                type="button"
                                onClick={() => handleSendPhoneOtp('voice')}
                                disabled={phoneBusy || !phone.trim()}
                                style={{
                                    marginTop: '0.5rem', background: 'none', border: 'none', padding: 0,
                                    color: 'var(--text-secondary)', fontSize: '0.85rem',
                                    textDecoration: 'underline', cursor: phone.trim() ? 'pointer' : 'not-allowed',
                                }}
                            >
                                📞 Get the code by call instead
                            </button>

                            {phoneOtpSent && (
                                <input
                                    type="text" inputMode="numeric" className="input-field"
                                    placeholder="6-digit code" maxLength={6} value={phoneOtpCode}
                                    onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    style={{ letterSpacing: '0.25rem', marginTop: '0.5rem' }}
                                />
                            )}

                            {phoneMsg && (
                                <p style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {phoneMsg}
                                </p>
                            )}
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
                            <p className="input-hint">
                                You will sit the Class {formData.classBand} paper. Choose carefully — you
                                will be asked to confirm this before the exam starts, and it cannot be
                                changed afterwards.
                            </p>
                        </div>

                        <SchoolPicker
                            value={school}
                            onChange={setSchool}
                            section={section}
                            onSectionChange={setSection}
                        />

                        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={isLoading}>
                            {isLoading ? 'Sending Code...' : 'Send Verification Code →'}
                        </button>
                        <button
                            type="button"
                            className="register-back"
                            onClick={() => { setError(''); setStep('presence'); }}
                        >
                            ← Back
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
                    {/* Once the account exists, "sign in instead" is misleading and
                        leaving is safe — so the footer says something different. */}
                    {accountExists ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            Your account is created. If you leave now you can sign in and finish the
                            remaining steps from your dashboard.
                        </div>
                    ) : (
                        <div>
                            Already have an account? <Link href="/login">Sign in</Link>
                        </div>
                    )}
                    <Link href="/" style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        ← Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
