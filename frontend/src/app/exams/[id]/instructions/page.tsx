'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import { useDeviceCheck } from '@/hooks/useDeviceCheck';
import { useSebHeaders } from '@/hooks/useSebHeaders';
import { useWebcam } from '@/hooks/useWebcam';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

export default function ExamInstructionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { deviceChecks, allChecksPassed } = useDeviceCheck();
    const { videoRef, canvasRef, startWebcam } = useWebcam();
    const { isSebBrowser } = useSebHeaders();
    const router = useRouter();
    const [webcamStarted, setWebcamStarted] = useState(false);
    const [webcamLoading, setWebcamLoading] = useState(false);

    const handleStartWebcam = async () => {
        setWebcamLoading(true);
        const stream = await startWebcam();
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
            description: 'Minimum 1024×768 display required',
            passed: deviceChecks.viewport,
        },
        {
            label: 'Safe Exam Browser',
            description: 'SEB must be installed and active',
            passed: deviceChecks.seb,
            // For dev, we allow bypassing SEB check
            allowBypass: true,
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
                            <li>This exam must be taken using <strong>Safe Exam Browser (SEB)</strong>.</li>
                            <li>Your webcam must remain on throughout the exam for AI proctoring.</li>
                            <li>Each question has its own timer — answer before it expires.</li>
                            <li>No switching tabs, apps, or windows during the exam.</li>
                            <li>Your answers are auto-saved every 10 seconds.</li>
                            <li>Negative marking applies for incorrect MCQ answers.</li>
                            <li>Do not close the browser — use the Submit button when done.</li>
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
                        {webcamStarted ? (
                            <div className="webcam-preview">
                                <video ref={videoRef} autoPlay muted playsInline />
                                <div className="webcam-indicator" />
                                <canvas ref={canvasRef} style={{ display: 'none' }} />
                            </div>
                        ) : (
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

                    {/* SEB Launch (if not in SEB) */}
                    {!isSebBrowser() && (
                        <div className="glass-card instructions-card seb-notice">
                            <h2>🔒 Launch Safe Exam Browser</h2>
                            <p>You are not currently in SEB. Click below to launch:</p>
                            <a
                                href={`seb://${typeof window !== 'undefined' ? window.location.host : ''}/api/seb/config/${id}`}
                                className="btn btn-primary"
                            >
                                Open in Safe Exam Browser
                            </a>
                            <p className="seb-download">
                                Don&apos;t have SEB?{' '}
                                <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noopener">
                                    Download here
                                </a>
                            </p>
                        </div>
                    )}

                    {/* Start Button */}
                    <div className="instructions-actions">
                        <button
                            className="btn btn-primary btn-lg"
                            disabled={!deviceChecks.viewport || !webcamStarted}
                            onClick={handleProceed}
                        >
                            ✅ Start Exam
                        </button>
                        <p className="start-note">
                            By clicking Start, you agree to the exam rules and AI proctoring terms.
                        </p>
                    </div>
                </div>

                <style jsx>{`
          .instructions-page {
            min-height: 100vh;
            padding: var(--space-8) var(--space-6);
            display: flex;
            justify-content: center;
          }
          .instructions-container {
            max-width: 720px;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: var(--space-6);
          }
          .instructions-header {
            text-align: center;
            margin-bottom: var(--space-4);
          }
          .instructions-subtitle {
            color: var(--text-secondary);
            margin-top: var(--space-2);
          }
          .instructions-card {
            padding: var(--space-6) var(--space-8);
          }
          .instructions-card h2 {
            font-size: 1.1rem;
            margin-bottom: var(--space-5);
          }
          .rules-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
          }
          .rules-list li {
            padding-left: var(--space-5);
            position: relative;
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.6;
          }
          .rules-list li::before {
            content: '•';
            position: absolute;
            left: 0;
            color: var(--primary-400);
            font-weight: bold;
          }
          .seb-notice {
            border-color: rgba(245, 158, 11, 0.3);
            background: rgba(245, 158, 11, 0.05);
          }
          .seb-download {
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-top: var(--space-3);
          }
          .instructions-actions {
            text-align: center;
            padding: var(--space-4) 0;
          }
          .start-note {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: var(--space-3);
          }
        `}</style>
            </div>
        </AuthGuard>
    );
}
