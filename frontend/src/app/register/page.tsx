'use client';

import { APP_NAME, CLASS_BANDS, COMPANY_NAME, SMS_OTP_ENABLED, TAGLINE, TERMS_VERSION } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import LimonTour from '@/components/limon/LimonTour';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emailOtp, isValidPhone } from '@/lib/auth-client';
import { captureReferralFromUrl, clearReferralCode, getReferralCode } from '@/lib/referral';
import { describeCameraError, describeError } from '@/lib/errors';
import SchoolPicker from '@/components/SchoolPicker';
import { GENDERS } from '@/components/GuardianForm';
import GuardianStep from './steps/GuardianStep';
import PaymentStep from './steps/PaymentStep';
import PresenceStep from './steps/PresenceStep';
import type { DirectorySchool } from '@/lib/schools';
import { findSchoolByCode } from '@/lib/schools';
import { FormEvent, useState, useEffect } from 'react';

/**
 * Student registration, in five steps.
 *
 * ## The order, and why it is this order
 *
 * `presence` → `details` → `verify` → `payment` → `guardian`
 *
 *  - **presence first**, before a single field: the student has to be at the
 *    keyboard for the face scan, and discovering that at the last step is too
 *    late. It also carries the T&C acceptance, so nobody types their details
 *    before seeing what they are agreeing to.
 *  - **details now also collects the parent/identification's own contact details,
 *    the ward's date of birth and gender** — everything about the family that
 *    isn't the face scan, the ID document or the consents themselves. That
 *    used to live on the final step, asked of a parent who had usually
 *    wandered off by then; collecting it up front means the final step is
 *    something the participant can finish entirely on their own.
 *  - **verify before the account exists**: the account is created at the end of
 *    `verify`, once the email is proven. Everything after that point can rely on
 *    a real, authenticated user, which is why `payment` and `guardian` can
 *    simply call authenticated endpoints.
 *  - **payment before guardian**: paying confirms the season and unlocks the
 *    dashboard. If a student abandons during the last step they can still sign
 *    in and complete it later.
 *  - **guardian last, and it is "Student identification"**: face scan, ID
 *    upload and the two consents, in one place. The face scan needs the
 *    student personally, so it happens first on this page, while they are
 *    certainly still there; the ID upload and consent that follow can be
 *    finished by a parent leaning over afterwards.
 *
 * Each step lives in its own component under `./steps/`. Only `details` and
 * `verify` remain inline, because they share the form state and the OTP handshake.
 */

type Step = 'presence' | 'details' | 'verify' | 'payment' | 'guardian';

/** Ordered, so the progress indicator and the labels derive from one list. */
const STEPS: { id: Step; label: string }[] = [
    { id: 'presence', label: 'Before you start' },
    { id: 'details', label: 'Your details' },
    { id: 'verify', label: 'Verify email' },
    { id: 'payment', label: 'Payment' },
    { id: 'guardian', label: 'Student identification' },
];

const SUBTITLES: Record<Step, string> = {
    presence: 'Please read this before you begin',
    details: 'Create your participant account',
    verify: 'Verify your email',
    payment: 'Complete your payment',
    guardian: 'Face scan, ID and consent',
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

    // The school directory is no longer pre-warmed. Searches are now pincode- or
    // name-driven, so the dropdown only loads once the student starts typing.

    // ── Step 0: presence + terms acknowledgements ──
    const [presenceAck, setPresenceAck] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [dataConsent, setDataConsent] = useState(false);

    // Mobile number stored for WhatsApp notifications.
    const [phone, setPhone] = useState('');

    // ── Parent/identification details, collected here now instead of on the final
    // step (see the module doc comment above for why). A single name field —
    // GuardianForm still has two columns for the standalone `/identification`
    // backfill page, but the whole name is sent as `guardianFirstName`; the
    // backend accepts an empty `guardianLastName`.
    const [guardianName, setGuardianName] = useState('');
    const [guardianEmail, setGuardianEmail] = useState('');
    const [guardianPhone, setGuardianPhone] = useState('');
    const [gender, setGender] = useState('');
    const [dob, setDob] = useState('');

    // No inline verify step: the code is submitted with the form and checked
    // server-side at /auth/sync. Verifying here would consume the single-use
    // code before registration could use it.

    // Mandatory face enrollment (after account creation) — now a section on
    // the "Student identification" step rather than a step of its own.
    const [faceCameraOn, setFaceCameraOn] = useState(false);
    const [faceCapturing, setFaceCapturing] = useState(false);
    const [faceMsg, setFaceMsg] = useState('');
    const [faceScanDone, setFaceScanDone] = useState(false);
    const {
        videoRef,
        isLoaded: modelsLoaded,
        startEnrollmentCamera,
        stopProctoring,
        captureDescriptor,
        captureSnapshot,
        enrollFace,
    } = useFaceProctor({ attemptId: 'enrollment', disabled: false });

    const handleStartFaceCapture = async () => {
        setFaceMsg('Loading face detection models…');
        setFaceCameraOn(true);
        try {
            const stream = await startEnrollmentCamera();
            if (!stream) {
                setFaceCameraOn(false);
                setFaceMsg('Camera unavailable. Make sure a webcam is connected and permission is granted.');
                return;
            }
            setFaceMsg('Position your face in the frame and click Capture.');
        } catch (err) {
            setFaceCameraOn(false);
            setFaceMsg(describeCameraError(err));
        }
    };

    const handleCaptureFace = async () => {
        setFaceCapturing(true);
        setFaceMsg('Capturing…');
        try {
            const descriptor = await captureDescriptor();
            if (!descriptor) {
                setFaceMsg(
                    "We couldn't see a face in the picture. Sit facing the camera in good light, with nothing covering your face, then capture again.",
                );
                return;
            }
            // Captured from the same live frame the descriptor came from — this
            // is the one photo of the student the certificate ever shows.
            const photo = captureSnapshot();
            const ok = await enrollFace(descriptor, photo);
            if (ok) {
                stopProctoring();
                // Face enrolled — the rest of this same step (ID + consent) unlocks.
                setFaceScanDone(true);
            } else {
                setFaceMsg(
                    "We couldn't save your face scan. Make sure your whole face is lit and in frame, then capture again.",
                );
            }
        } catch (err) {
            setFaceMsg(describeError(err, 'capture your face scan'));
        } finally {
            setFaceCapturing(false);
        }
    };

    // A partner may link straight here (`/register?ref=CODE`).
    useEffect(() => {
        captureReferralFromUrl();
    }, []);

    /**
     * A school referral link lands as `/register?school=SCH-XXXXXX`. Resolve the
     * code and pre-pick the school — the field stays a normal picker, so the
     * student can still change it or search for a different school. A bad or
     * unknown code is ignored: the prefill must never block registration.
     */
    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('school');
        if (!code) return;
        let cancelled = false;
        findSchoolByCode(code)
            .then((found) => { if (!cancelled) setSchool((s) => s ?? found); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.name === 'classBand' ? parseInt(e.target.value) : e.target.value,
        }));
    };

    /**
     * Everything the details step currently holds, for the send-otp call.
     * Read fresh at send time rather than stored once, so a resend after
     * editing a field (a typo'd phone number, say) carries the correction.
     */
    const registrationDetails = () => ({
        name: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: phone.trim(),
        classBand: formData.classBand,
        schoolId: school?.id,
        schoolName: school?.name,
        section: section.trim() || undefined,
    });

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
        // These four are collected here now but only submitted at the final
        // "Student identification" step, whose form no longer has fields for
        // them (see GuardianStep's `hideGuardianInfoFields`) — so they have to
        // be right before the student ever leaves this page.
        if (!guardianName.trim()) {
            setError("Please enter the parent or guardian's name.");
            return;
        }
        if (!guardianEmail.trim()) {
            setError("Please enter the parent or guardian's email address.");
            return;
        }
        if (!guardianPhone.trim()) {
            setError("Please enter the parent or guardian's mobile number.");
            return;
        }
        // Compulsory — every exam SMS and WhatsApp goes to this number.
        if (!phone.trim() || !isValidPhone(phone)) {
            setError("Please enter a valid mobile number for the participant — exam updates are sent to it.");
            return;
        }
        if (!dob) {
            setError("Please enter the participant's date of birth.");
            return;
        }
        // Checked here, on the page that collects it — the backend repeats the
        // same range, but an error surfacing two steps later would point at a
        // field the parent cannot see any more.
        const dobYears = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (!Number.isFinite(dobYears) || dobYears < 3 || dobYears > 19) {
            setError('Check the date of birth — participants must be between 3 and 19 years old.');
            return;
        }
        if (!gender) {
            setError("Please select the participant's gender.");
            return;
        }

        // School is required — checked here as well as server-side so the student
        // is told before an OTP is spent rather than after.
        if (!school) {
            setError('Please choose your school. Search for it, enter a school code, or select it.');
            return;
        }
        // Section is required too. Results are reported to schools class by
        // class, and a school-level report with a third of its rows missing a
        // section cannot be split into classes at all — which is the thing the
        // report is for.
        if (!section.trim()) {
            setError('Please enter your class section, exactly as your school writes it.');
            return;
        }
        setIsLoading(true);
        try {
            const { error: otpError } = await emailOtp.sendVerificationOtp(formData.email, registrationDetails());
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
                        "That code didn't work. Codes expire after a few minutes, use “Resend code” to get a fresh one, and check your spam folder.",
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
                ...(school
                    ? {
                          schoolId: school.id,
                          ...(school.code ? { schoolCode: school.code } : {}),
                      }
                    : {}),
                section: section.trim(),
                // The version actually shown on the presence step, so a later
                // revision is distinguishable from what was agreed to.
                termsVersion: TERMS_VERSION,
                ...(referralCode ? { referralCode } : {}),
                phone: phone.trim(),
                // The emailed code. Where our own API owns it, `verifyEmail`
                // above deferred rather than checked, and this is where it is
                // proved and consumed — so a registration cannot be completed
                // for an address the person does not control.
                code: otp,
            });
            clearReferralCode();
            setSuccess('');

            // Account created — payment is next, then student identification.
            setStep('payment');
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
            const { error: otpError } = await emailOtp.sendVerificationOtp(formData.email, registrationDetails());
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
    // The account exists from `payment` onwards, so leaving is no longer destructive.
    const accountExists = stepIndex >= STEPS.findIndex((s) => s.id === 'payment');

    return (
        <div className="auth-page">
            {/* Limon walks through registration, once, and only on the details
                step — the later steps are OTP entry, payment, and student
                identification, each of which is a single focused action that a
                tour would only get in the way of. */}
            <LimonTour tourId="register" ready={step === 'details'} />
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

                {/* Progress — five steps is enough that "am I nearly done?" needs answering. */}
                <ol className="register-progress" aria-label="Registration progress" data-limon="register-steps">
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
                        guardianInfo={{
                            guardianFirstName: guardianName.trim(),
                            // Not collected on this flow — the backend no longer
                            // requires it (see `SubmitGuardianDto.relationship`).
                            relationship: '',
                            guardianEmail: guardianEmail.trim(),
                            guardianPhone: guardianPhone.trim(),
                            studentDob: dob,
                            gender,
                        }}
                        videoRef={videoRef}
                        modelsLoaded={modelsLoaded}
                        faceCameraOn={faceCameraOn}
                        faceCapturing={faceCapturing}
                        faceMsg={faceMsg}
                        faceScanDone={faceScanDone}
                        onStartFaceCapture={handleStartFaceCapture}
                        onCaptureFace={handleCaptureFace}
                        onDone={() => { stopProctoring(); router.push('/feedback/registration'); }}
                    />
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
                            <label className="input-label" htmlFor="guardianName">Parent / Guardian Name</label>
                            <input
                                id="guardianName" name="guardianName" type="text" className="input-field"
                                placeholder="Full name" value={guardianName}
                                onChange={(e) => setGuardianName(e.target.value)} required
                            />
                        </div>
                        <div className="form-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="email">Participant&apos;s Email</label>
                                <input
                                    id="email" name="email" type="email" className="input-field"
                                    placeholder="you@example.com" value={formData.email}
                                    onChange={handleChange} required suppressHydrationWarning
                                />
                                <p className="input-hint">We&apos;ll send your verification code here.</p>
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="guardianEmail">Parent&apos;s Email</label>
                                <input
                                    id="guardianEmail" name="guardianEmail" type="email" className="input-field"
                                    placeholder="parent@example.com" value={guardianEmail}
                                    onChange={(e) => setGuardianEmail(e.target.value)} required
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="phone">
                                    Participant&apos;s Mobile <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(for WhatsApp updates)</span>
                                </label>
                                <input
                                    id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel"
                                    className="input-field" placeholder="+91 98765 43210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    required suppressHydrationWarning
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="guardianPhone">
                                    Parent&apos;s Mobile <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(preferred WhatsApp)</span>
                                </label>
                                <input
                                    id="guardianPhone" name="guardianPhone" type="tel" inputMode="tel" autoComplete="tel"
                                    className="input-field" placeholder="+91 98765 43210"
                                    value={guardianPhone}
                                    onChange={(e) => setGuardianPhone(e.target.value)} required
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="input-group">
                                <label className="input-label" htmlFor="gender">Gender</label>
                                <select
                                    id="gender" name="gender" className="input-field" required
                                    value={gender} onChange={(e) => setGender(e.target.value)}
                                >
                                    <option value="" disabled>Select…</option>
                                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="dob">Date of Birth</label>
                                <input
                                    id="dob" name="dob" type="date" className="input-field" required
                                    min={new Date(new Date().getFullYear() - 19, new Date().getMonth(), new Date().getDate()).toISOString().slice(0, 10)}
                                    max={new Date(new Date().getFullYear() - 3, new Date().getMonth(), new Date().getDate()).toISOString().slice(0, 10)}
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="input-group" data-limon="register-class">
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
                                You will sit the Class {formData.classBand} Innovation Olympiad exam. Choose carefully, you
                                will be asked to confirm this before the exam starts, and it cannot be
                                changed afterwards.
                            </p>
                        </div>

                        <div data-limon="register-school">
                        <SchoolPicker
                            value={school}
                            onChange={setSchool}
                            section={section}
                            onSectionChange={setSection}
                        />
                        </div>

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
