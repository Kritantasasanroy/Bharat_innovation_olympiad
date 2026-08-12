'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/** What `GET /guardian/me` returns — see `GuardianService.status`. */
interface GuardianStatus {
    version: string;
    complete: boolean;
    profile: {
        guardianFirstName: string;
        guardianLastName: string;
        relationship: string;
        guardianEmail: string;
        guardianPhone: string;
        parentalConsentAt: string | null;
        dataConsentAt: string | null;
        approvalEmailSentAt: string | null;
        consentVersion: string;
    } | null;
}

function fmtDateTime(value: string | null | undefined) {
    if (!value) return null;
    return new Date(value).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function GuardianRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{label}</span>
            <span style={{ fontSize: '0.9rem', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
        </div>
    );
}

export default function ProfilePage() {
    const { user } = useAuthStore();

    // Face enrollment state
    const [enrollmentStatus, setEnrollmentStatus] = useState<'unknown' | 'enrolled' | 'not_enrolled'>('unknown');
    const [enrollMsg, setEnrollMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [enrolling, setEnrolling] = useState(false);

    const {
        videoRef,
        isLoaded: modelsLoaded,
        loadingProgress,
        startEnrollmentCamera,
        stopProctoring,
        captureDescriptor,
        enrollFace,
    } = useFaceProctor({ attemptId: 'enrollment', disabled: false });

    // Check enrollment status on mount
    useEffect(() => {
        api.get('/proctor/enrollment')
            .then((r) => setEnrollmentStatus(r.data.enrolled ? 'enrolled' : 'not_enrolled'))
            .catch(() => setEnrollmentStatus('not_enrolled'));
    }, []);

    /**
     * Registration part 2 — the parent's details and when they consented.
     *
     * Shown read-only. A student should be able to see what was recorded about
     * their parent and when it was agreed to, but changing a consent record from
     * the child's own account would defeat the point of it being a parent's
     * consent; edits go back through the guardian form.
     */
    const [guardian, setGuardian] = useState<GuardianStatus | null>(null);
    useEffect(() => {
        api.get<GuardianStatus>('/guardian/me')
            .then((r) => setGuardian(r.data))
            .catch(() => setGuardian(null));
    }, []);

    const handleOpenCamera = async () => {
        setEnrollMsg({ text: 'Loading face detection models…', type: 'info' });
        setCameraActive(true);
        try {
            await startEnrollmentCamera();
            setEnrollMsg({ text: 'Position your face in the frame and click Capture.', type: 'info' });
        } catch {
            setCameraActive(false);
            setEnrollMsg({ text: 'Could not access camera. Please allow camera permissions and try again.', type: 'error' });
        }
    };

    const handleCapture = async () => {
        setEnrolling(true);
        setEnrollMsg({ text: 'Capturing…', type: 'info' });
        const descriptor = await captureDescriptor();
        if (!descriptor) {
            setEnrolling(false);
            setEnrollMsg({ text: 'No face detected. Ensure your face is clearly visible and try again.', type: 'error' });
            return;
        }
        const ok = await enrollFace(descriptor);
        stopProctoring();
        setCameraActive(false);
        setEnrolling(false);
        if (ok) {
            setEnrollmentStatus('enrolled');
            setEnrollMsg({ text: 'Face enrolled successfully! You are ready for AI-proctored exams.', type: 'success' });
        } else {
            setEnrollMsg({ text: 'Enrollment failed. Please try again.', type: 'error' });
        }
    };

    if (!user) return null;

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <h1>My Profile</h1>
                    <p className="text-secondary">Your registered details. None of this can be edited here.</p>
                </div>

                {/**
                 * Every field on this card is locked.
                 *
                 * "None of the details should be editable" — name and phone used to
                 * have their own edit-and-save form, including a full SMS-verified
                 * phone-change flow. That is gone: this is now a read-only mirror of
                 * the account, exactly like the Email, School and Class rows already
                 * were. A wrong name or a number that needs updating goes through
                 * support instead, the same route already used for a wrong class —
                 * one consistent way to correct any registered detail, not two.
                 */}
                <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        <div className="input-group">
                            <label className="input-label">Email Address</label>
                            <input
                                type="email"
                                className="input-field"
                                value={user.email}
                                disabled
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                            />
                            <small className="text-muted" style={{ marginTop: '0.25rem', display: 'block' }}>Email address cannot be changed.</small>
                        </div>

                        <div className="input-group">
                            <label className="input-label">School</label>
                            <input
                                type="text"
                                className="input-field"
                                value={user.school?.name || 'No school assigned'}
                                disabled
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                            />
                            <small className="text-muted" style={{ marginTop: '0.25rem', display: 'block' }}>School assignment cannot be changed.</small>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">First Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={user.firstName}
                                    disabled
                                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Last Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={user.lastName}
                                    disabled
                                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                                />
                            </div>
                        </div>
                        <small className="text-muted" style={{ marginTop: '-1rem', display: 'block' }}>
                            Your name cannot be changed here. If it is misspelt,{' '}
                            <Link href="/support">raise a support ticket</Link>.
                        </small>

                        <div className="input-group">
                            <label className="input-label">Contact number</label>
                            <input
                                type="tel"
                                className="input-field"
                                value={user.phone || 'Not provided'}
                                disabled
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                            />
                            <small className="text-muted" style={{ marginTop: '0.25rem', display: 'block' }}>
                                Used to reach you about your exam schedule and results. To add or change
                                it, <Link href="/support">raise a support ticket</Link>.
                            </small>
                        </div>

                        {/* Class is final once set — it decides which paper is
                            sat and which cohort the result is ranked against,
                            and it is confirmed again on the instructions screen
                            immediately before the exam opens. Shown as a locked
                            field rather than removed, because a student needs to
                            be able to check it is right. The server refuses a
                            change too; this is not the only guard. */}
                        <div className="input-group">
                            <label className="input-label">Class</label>
                            <input
                                type="text"
                                className="input-field"
                                value={user.classBand ? `Class ${user.classBand}` : 'Not set'}
                                disabled
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                            />
                            <small className="text-muted" style={{ marginTop: '0.25rem', display: 'block' }}>
                                Your class is final: it decides which paper you sit and who you are
                                ranked against. If it is wrong,{' '}
                                <Link href="/support">raise a support ticket</Link> and we will
                                correct it before your exam.
                            </small>
                        </div>
                    </div>
                </div>
                {/* Parent / guardian — registration part 2, read-only */}
                <div className="glass-card" style={{ maxWidth: '600px', margin: '2rem auto 0', padding: '2rem' }}>
                    <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Parent / Guardian</h2>

                    {!guardian?.profile ? (
                        <>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                A parent or guardian has to give consent before you can start any exam,
                                including the practice paper. It takes about two minutes and only needs
                                doing once.
                            </p>
                            <Link href="/guardian?next=/profile" className="btn btn-primary">
                                Complete the parent section
                            </Link>
                        </>
                    ) : (
                        <>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                                What your parent or guardian gave us, and when they agreed. To change
                                any of it, <Link href="/guardian?next=/profile">reopen the parent form</Link>.
                            </p>

                            <GuardianRow
                                label="Name"
                                value={`${guardian.profile.guardianFirstName} ${guardian.profile.guardianLastName}`.trim()}
                            />
                            <GuardianRow label="Relationship" value={guardian.profile.relationship} />
                            <GuardianRow label="Email" value={guardian.profile.guardianEmail} />
                            <GuardianRow label="Phone" value={guardian.profile.guardianPhone} />
                            <GuardianRow
                                label="Confirmation email sent"
                                value={
                                    fmtDateTime(guardian.profile.approvalEmailSentAt) ?? (
                                        <span style={{ color: 'var(--warning-400)' }}>Not sent</span>
                                    )
                                }
                            />
                            <GuardianRow
                                label="Parental consent accepted"
                                value={
                                    fmtDateTime(guardian.profile.parentalConsentAt) ?? (
                                        <span style={{ color: 'var(--danger-400)' }}>Not accepted</span>
                                    )
                                }
                            />
                            <GuardianRow
                                label="Data-processing consent accepted"
                                value={
                                    fmtDateTime(guardian.profile.dataConsentAt) ?? (
                                        <span style={{ color: 'var(--danger-400)' }}>Not accepted</span>
                                    )
                                }
                            />

                            {!guardian.complete && (
                                <p style={{ color: 'var(--warning-400)', fontSize: '0.85rem', marginTop: '1rem' }}>
                                    Our consent wording has changed since your parent agreed, so it needs
                                    confirming once more before your next exam.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Face Enrollment Section */}
                <div className="glass-card" style={{ maxWidth: '600px', margin: '2rem auto 0', padding: '2rem' }}>
                    <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Face ID for Proctoring</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        Required for AI-proctored exams. Your face is stored as an encrypted numeric descriptor, no photo is saved.
                    </p>

                    {/* Status badge */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        {enrollmentStatus === 'enrolled' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--success-500)', color: '#fff', padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600 }}>
                                ✓ Face Enrolled
                            </span>
                        )}
                        {enrollmentStatus === 'not_enrolled' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--danger-500)', color: '#fff', padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600 }}>
                                ✗ Not Enrolled
                            </span>
                        )}
                        {enrollmentStatus === 'unknown' && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Checking…</span>
                        )}
                    </div>

                    {/* Enrollment message */}
                    {enrollMsg && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            marginBottom: '1rem',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            background: enrollMsg.type === 'success' ? 'var(--success-500)' : enrollMsg.type === 'error' ? 'var(--danger-500)' : 'var(--bg-elevated)',
                            color: enrollMsg.type === 'info' ? 'var(--text-secondary)' : '#fff',
                            border: enrollMsg.type === 'info' ? '1px solid var(--border-color)' : 'none',
                        }}>
                            {enrollMsg.text}
                        </div>
                    )}

                    {/* Camera preview */}
                    {cameraActive && (
                        <div style={{ position: 'relative', marginBottom: '1rem', borderRadius: '12px', overflow: 'hidden', background: '#000', maxWidth: '320px' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
                            />
                            <div style={{
                                position: 'absolute', inset: 0,
                                border: '2px solid var(--primary-400)',
                                borderRadius: '12px',
                                pointerEvents: 'none',
                            }} />
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {!cameraActive ? (
                            <button
                                className="btn btn-primary"
                                onClick={handleOpenCamera}
                                disabled={enrollmentStatus === 'unknown'}
                            >
                                {enrollmentStatus === 'enrolled' ? 'Re-enroll Face' : 'Enroll Face'}
                            </button>
                        ) : (
                            <>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleCapture}
                                    disabled={enrolling || !modelsLoaded}
                                >
                                    {enrolling ? 'Saving…' : modelsLoaded ? 'Capture & Save' : loadingProgress || 'Loading models…'}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { stopProctoring(); setCameraActive(false); setEnrollMsg(null); }}
                                    disabled={enrolling}
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}
