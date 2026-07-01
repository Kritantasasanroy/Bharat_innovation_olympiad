'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useDeviceCheck } from '@/hooks/useDeviceCheck';
import { useWebcam } from '@/hooks/useWebcam';
import { useFaceProctor } from '@/hooks/useFaceProctor';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

export default function ExamInstructionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { deviceChecks, allChecksPassed } = useDeviceCheck();
    const { videoRef, startWebcam } = useWebcam();
    const router = useRouter();
    const [webcamStarted, setWebcamStarted] = useState(false);
    const [webcamLoading, setWebcamLoading] = useState(false);

    // Face ID enrollment gate — must be enrolled before Start Exam is enabled.
    const [faceEnrollStatus, setFaceEnrollStatus] = useState<'checking' | 'enrolled' | 'not_enrolled'>('checking');
    const [faceMsg, setFaceMsg] = useState('');
    const [faceCapturing, setFaceCapturing] = useState(false);
    const {
        videoRef: faceVideoRef,
        isLoaded: faceModelsLoaded,
        loadingProgress: faceLoadingProgress,
        startEnrollmentCamera,
        captureDescriptor,
        enrollFace,
    } = useFaceProctor({ attemptId: 'device-check', disabled: false });

    useEffect(() => {
        api.get('/proctor/enrollment')
            .then((r) => setFaceEnrollStatus(r.data.enrolled ? 'enrolled' : 'not_enrolled'))
            .catch(() => setFaceEnrollStatus('not_enrolled'));
    }, []);

    // Once camera permission is granted, also warm up face-api.js so Capture is instant.
    useEffect(() => {
        if (deviceChecks.webcam && faceEnrollStatus === 'not_enrolled') {
            setFaceMsg('Loading face detection models…');
            startEnrollmentCamera()
                .then(() => setFaceMsg('Position your face in the frame and click Capture.'))
                .catch(() => setFaceMsg('Could not access camera for face enrollment.'));
        }
    }, [deviceChecks.webcam, faceEnrollStatus]);

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
        setFaceCapturing(false);
        if (ok) {
            setFaceEnrollStatus('enrolled');
            setFaceMsg('Face enrolled successfully!');
        } else {
            setFaceMsg('Enrollment failed. Please try again.');
        }
    };

    const handleStartWebcam = async () => {
        setWebcamLoading(true);
        const stream = await startWebcam();
        // useWebcam attaches the stream to the <video> internally via a
        // callback ref, so no manual srcObject assignment is needed here.
        setWebcamStarted(!!stream);
        setWebcamLoading(false);
    };

    // Auto-start webcam once the camera permission check passes
    useEffect(() => {
        if (deviceChecks.webcam && !webcamStarted && !webcamLoading) {
            handleStartWebcam();
        }
    }, [deviceChecks.webcam]);

    const handleProceed = () => {
        router.push(`/exams/${id}/play`);
    };

    const checks = [
        {
            label: 'Screen Resolution',
            description: 'Minimum 800×600 display required',
            passed: deviceChecks.viewport,
        },
        {
            label: 'Fullscreen Support',
            description: 'Browser must support fullscreen mode',
            passed: deviceChecks.fullscreen,
        },
        {
            label: 'Webcam',
            description: deviceChecks.webcam === null
                ? 'Requesting camera permission...'
                : deviceChecks.webcam
                    ? (webcamStarted ? 'Camera active and ready' : 'Camera detected, starting...')
                    : 'Camera access denied or no camera found',
            passed: deviceChecks.webcam && webcamStarted,
        },
        {
            label: 'Microphone',
            description: deviceChecks.audio === null
                ? 'Requesting microphone permission...'
                : deviceChecks.audio
                    ? 'Microphone detected'
                    : 'No microphone found or access denied',
            passed: deviceChecks.audio,
        },
        {
            label: 'Face ID Enrollment',
            description: faceEnrollStatus === 'checking'
                ? 'Checking enrollment status...'
                : faceEnrollStatus === 'enrolled'
                    ? 'Face already enrolled'
                    : 'Required — enroll below before starting',
            passed: faceEnrollStatus === 'checking' ? null : faceEnrollStatus === 'enrolled',
        },
    ];

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <div className="instructions-page animate-fade-in">
                <div className="instructions-container">
                    <div className="instructions-header">
                        <h1>Exam Instructions</h1>
                        <p className="instructions-subtitle">
                            Please read carefully and complete the device checks before starting.
                        </p>
                    </div>

                    {/* Instructions */}
                    <div className="glass-card instructions-card">
                        <h2>📋 Rules & Guidelines</h2>
                        <ul className="rules-list">
                            <li>The exam must be taken in <strong>fullscreen mode</strong>.</li>
                            <li>Your webcam must remain on throughout the exam for AI proctoring — stay visible and look at the screen.</li>
                            <li>Exiting fullscreen or switching tabs will pause the exam.</li>
                            <li>If paused for more than 20 seconds, the exam will auto-submit.</li>
                            <li>Violations are recorded for actions that break exam integrity rules — including leaving fullscreen, switching tabs, or camera/face issues. After 3 violations, the exam auto-submits.</li>
                            <li>Your answers are auto-saved continuously.</li>
                            <li>Negative marking applies for incorrect MCQ answers.</li>
                            <li>Use the Submit button when done — do not close the browser.</li>
                        </ul>
                    </div>

                    {/* Device Checks */}
                    <div className="glass-card instructions-card">
                        <h2>🔍 Device Compatibility Check</h2>
                        <div className="device-check-list">
                            {checks.map((check, i) => (
                                <div key={i} className="device-check-item">
                                    <div className={`check-icon ${check.passed ? 'pass' : check.passed === null ? 'pending' : 'fail'}`}>
                                        {check.passed ? '✓' : check.passed === null ? '…' : '✗'}
                                    </div>
                                    <div>
                                        <strong>{check.label}</strong>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            {check.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Webcam Preview */}
                    <div className="glass-card instructions-card">
                        <h2>📷 Webcam Check</h2>
                        <div className="webcam-preview" style={{ display: webcamStarted ? 'block' : 'none' }}>
                            <video ref={videoRef} autoPlay muted playsInline />
                            <div className="webcam-indicator" />
                        </div>
                        
                        {!webcamStarted && (
                            <div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>
                                    {deviceChecks.webcam === null
                                        ? 'Waiting for camera permission...'
                                        : deviceChecks.webcam === false
                                            ? 'Camera access was denied. Please allow camera access in your browser settings and try again.'
                                            : 'Starting camera...'}
                                </p>
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleStartWebcam}
                                    disabled={webcamLoading}
                                >
                                    {webcamLoading ? 'Starting...' : 'Enable Webcam'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Face ID Enrollment — required, blocks Start Exam until done */}
                    {faceEnrollStatus !== 'enrolled' && (
                        <div className="glass-card instructions-card">
                            <h2>🪪 Face ID Enrollment</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-4)' }}>
                                This is a proctored exam — you must enroll your face before you can start. Your face is stored as an encrypted numeric descriptor, not a photo.
                            </p>

                            {faceEnrollStatus === 'checking' ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Checking enrollment status…</p>
                            ) : (
                                <>
                                    {faceMsg && (
                                        <p style={{
                                            fontSize: '0.85rem', marginBottom: 'var(--space-3)',
                                            color: faceMsg.startsWith('No face') || faceMsg.startsWith('Enrollment failed') || faceMsg.startsWith('Could not access')
                                                ? 'var(--danger-400)' : 'var(--text-secondary)',
                                        }}>
                                            {faceMsg}
                                        </p>
                                    )}
                                    {deviceChecks.webcam && (
                                        <div className="webcam-preview" style={{ marginBottom: 'var(--space-4)' }}>
                                            <video ref={faceVideoRef} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCaptureFace}
                                        disabled={!deviceChecks.webcam || !faceModelsLoaded || faceCapturing}
                                    >
                                        {faceCapturing ? 'Saving…' : !deviceChecks.webcam ? 'Enable webcam above first' : faceModelsLoaded ? 'Capture & Enroll Face' : (faceLoadingProgress || 'Loading models…')}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Start Button */}
                    <div className="instructions-actions">
                        <button
                            className="btn btn-primary btn-lg"
                            disabled={!deviceChecks.viewport || !deviceChecks.fullscreen || !webcamStarted || faceEnrollStatus !== 'enrolled'}
                            onClick={handleProceed}
                        >
                            ✅ Start Exam
                        </button>
                        <p className="start-note">
                            By clicking Start, you agree to the exam rules and AI proctoring terms.
                        </p>
                    </div>
                </div>


            </div>
        </AuthGuard>
    );
}
