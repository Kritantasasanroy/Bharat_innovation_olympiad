'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { useAuthStore } from '@/store/authStore';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import { FormEvent, useEffect, useState } from 'react';

export default function ProfilePage() {
    const { user, updateProfile } = useAuthStore();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [classBand, setClassBand] = useState<number>(6);

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // Face enrollment state
    const [enrollmentStatus, setEnrollmentStatus] = useState<'unknown' | 'enrolled' | 'not_enrolled'>('unknown');
    const [enrollMsg, setEnrollMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [enrolling, setEnrolling] = useState(false);

    const {
        videoRef,
        isLoaded: modelsLoaded,
        loadingProgress,
        startProctoring,
        stopProctoring,
        captureDescriptor,
        enrollFace,
    } = useFaceProctor({ attemptId: 'enrollment', disabled: false });

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName || '');
            setLastName(user.lastName || '');
            setClassBand(user.classBand || 6);
        }
    }, [user]);

    // Check enrollment status on mount
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        fetch('/api/proctor/enrollment', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((d) => setEnrollmentStatus(d.enrolled ? 'enrolled' : 'not_enrolled'))
            .catch(() => setEnrollmentStatus('not_enrolled'));
    }, []);

    const handleOpenCamera = async () => {
        setEnrollMsg({ text: 'Loading face detection models…', type: 'info' });
        await startProctoring();
        setCameraActive(true);
        setEnrollMsg({ text: 'Position your face in the frame and click Capture.', type: 'info' });
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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            await updateProfile({ firstName, lastName, classBand });
            setMessage({ text: 'Profile updated successfully!', type: 'success' });
            
            // Clear message after 3 seconds
            setTimeout(() => {
                setMessage(null);
            }, 3000);
        } catch (error: any) {
            setMessage({ 
                text: error.response?.data?.message || 'Failed to update profile. Please try again.', 
                type: 'error' 
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!user) return null;

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <h1>My Profile</h1>
                    <p className="text-secondary">View and update your personal details.</p>
                </div>

                <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
                    {message && (
                        <div style={{ 
                            padding: '1rem', 
                            marginBottom: '1.5rem', 
                            borderRadius: '8px', 
                            backgroundColor: message.type === 'success' ? 'var(--success-500)' : 'var(--danger-500)',
                            color: 'white',
                            textAlign: 'center',
                            fontWeight: '500'
                        }}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
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
                                    value={firstName} 
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required 
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Last Name</label>
                                <input 
                                    type="text" 
                                    className="input-field" 
                                    value={lastName} 
                                    onChange={(e) => setLastName(e.target.value)}
                                    required 
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Class</label>
                            <select 
                                className="input-field" 
                                value={classBand} 
                                onChange={(e) => setClassBand(parseInt(e.target.value))}
                                required
                            >
                                <option value={6}>Class 6</option>
                                <option value={7}>Class 7</option>
                                <option value={8}>Class 8</option>
                                <option value={9}>Class 9</option>
                                <option value={10}>Class 10</option>
                                <option value={11}>Class 11</option>
                                <option value={12}>Class 12</option>
                            </select>
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            style={{ marginTop: '1rem' }}
                            disabled={isLoading || (firstName === user.firstName && lastName === user.lastName && classBand === user.classBand)}
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </form>
                </div>
                {/* Face Enrollment Section */}
                <div className="glass-card" style={{ maxWidth: '600px', margin: '2rem auto 0', padding: '2rem' }}>
                    <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Face ID for Proctoring</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        Required for AI-proctored exams. Your face is stored as an encrypted numeric descriptor — no photo is saved.
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
