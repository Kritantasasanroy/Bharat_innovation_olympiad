'use client';

import GuardianForm, { GuardianFormValues } from '@/components/GuardianForm';
import api from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useEffect, useState } from 'react';

/**
 * Registration's last step — "Student identification".
 *
 * Used to be two steps (a standalone face scan, then parent consent). Folded
 * into one page: the parent/identification's own details (name, email, phone,
 * relationship, the ward's DOB and gender) were moved to the earlier details
 * step and arrive here already known, via `guardianInfo` — so this page has
 * exactly three things left to do, in order: scan the participant's face,
 * upload their ID document, and give the two consents. `GuardianForm` still
 * renders the ID + consent fieldsets (with `hideGuardianInfoFields`, so it
 * skips the fields collected earlier) — the standalone `/identification` backfill
 * page for pre-existing accounts still gets the full form from that same
 * component, unchanged.
 */

/**
 * Cosmetic only. The real delay is the face-detection model (~6 MB) loading
 * and warming up — a blank "42%" progress readout reads as the page being
 * slow; a rotating "doing something" message reads as the page working.
 */
const COSMETIC_MESSAGES = [
    'Scanning your face…',
    'Loading AI…',
    'Calibrating camera…',
    'Almost there…',
];
const COSMETIC_INTERVAL_MS = 1400;

function useCosmeticMessage(active: boolean): string {
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (!active) {
            setIndex(0);
            return;
        }
        const timer = setInterval(() => setIndex((i) => (i + 1) % COSMETIC_MESSAGES.length), COSMETIC_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [active]);
    return COSMETIC_MESSAGES[index];
}

export default function GuardianStep({
    studentName,
    guardianInfo,
    videoRef,
    modelsLoaded,
    faceCameraOn,
    faceCapturing,
    faceMsg,
    faceScanDone,
    onStartFaceCapture,
    onCaptureFace,
    onDone,
}: {
    studentName?: string;
    /** Collected earlier, on the details step — this page only adds ID + consent. */
    guardianInfo: Pick<
        GuardianFormValues,
        'guardianFirstName' | 'relationship' | 'guardianEmail' | 'guardianPhone' | 'studentDob' | 'gender'
    >;
    videoRef: (el: HTMLVideoElement | null) => void;
    modelsLoaded: boolean;
    faceCameraOn: boolean;
    faceCapturing: boolean;
    faceMsg: string;
    faceScanDone: boolean;
    onStartFaceCapture: () => void;
    onCaptureFace: () => void;
    onDone: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // The delay worth masking: models + camera still loading, or a capture
    // attempt in flight. Once a real face message would be shown (an error,
    // "position your face", success) the cosmetic loop steps aside.
    const loading = (faceCameraOn && !modelsLoaded) || faceCapturing;
    const cosmeticMsg = useCosmeticMessage(loading);
    const displayedFaceMsg = loading ? cosmeticMsg : faceMsg;

    const handleSubmit = async (values: GuardianFormValues) => {
        setBusy(true);
        setError('');
        try {
            await api.post('/identification', {
                ...values,
                // Blank optional fields are omitted rather than sent as '' — an
                // empty string is not a valid ISO date and would fail validation
                // for the whole form.
                studentDob: values.studentDob || undefined,
                gender: values.gender || undefined,
                city: values.city || undefined,
                state: values.state || undefined,
            });
            onDone();
        } catch (err: any) {
            setError(describeError(err, "save your parent's details"));
        } finally {
            setBusy(false);
        }
    };

    const isError =
        faceMsg.startsWith('No face') ||
        faceMsg.startsWith('Enrollment failed') ||
        faceMsg.startsWith('Could not access') ||
        faceMsg.startsWith("We couldn't");

    return (
        <div className="auth-form">
            <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Student identification</h2>
            <p className="guardian-form__lede" style={{ marginTop: 0 }}>
                The last step. {studentName ? <strong>{studentName}</strong> : 'The participant'} scans
                their face below, then a parent or guardian uploads an ID document and gives consent.
            </p>

            <div className="scan-warning" role="note">
                <strong>This scan is the participant&apos;s exam identity.</strong> On exam day the
                same face is checked against the photo ID uploaded below, and again by the camera
                continuously throughout the paper. If the person sitting the exam does not match this
                scan, <strong>the attempt can be disqualified.</strong> So scan the actual participant
                now, in good light, with nothing covering the face — the participant must do this
                themselves, not a parent or anyone else.
            </div>

            {!faceScanDone && displayedFaceMsg && (
                <div
                    style={{
                        padding: '0.75rem 1rem',
                        marginBottom: '1rem',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        textAlign: 'center',
                        background: !loading && isError ? 'rgba(239,68,68,0.12)' : 'var(--bg-elevated)',
                        color: !loading && isError ? '#dc2626' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                    }}
                >
                    {displayedFaceMsg}
                </div>
            )}

            {faceCameraOn && !faceScanDone && (
                <div
                    style={{
                        position: 'relative',
                        margin: '0 auto 1.25rem',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#000',
                        maxWidth: '320px',
                    }}
                >
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
                    />
                    {/* A guide, not a mask over the whole feed — the participant needs to
                        see themselves to line up, not just the outline they're aiming for. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        <div
                            style={{
                                width: '58%',
                                aspectRatio: '3 / 4',
                                borderRadius: '50%',
                                border: '3px dashed rgba(255,255,255,0.85)',
                            }}
                        />
                    </div>
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            border: '2px solid var(--primary-400)',
                            borderRadius: '12px',
                            pointerEvents: 'none',
                        }}
                    />
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {faceScanDone ? (
                    <div className="auth-success" style={{ width: '100%', textAlign: 'center', fontWeight: 600 }}>
                        ✓ Face scan complete
                    </div>
                ) : !faceCameraOn ? (
                    <button type="button" className="btn btn-primary btn-lg auth-submit" onClick={onStartFaceCapture}>
                        Enable Camera &amp; Scan Face
                    </button>
                ) : (
                    <button
                        type="button"
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={onCaptureFace}
                        disabled={faceCapturing || !modelsLoaded}
                    >
                        {faceCapturing ? cosmeticMsg : modelsLoaded ? 'Capture & Continue' : cosmeticMsg}
                    </button>
                )}
            </div>

            <GuardianForm
                studentName={studentName}
                initial={guardianInfo}
                hideGuardianInfoFields
                requireFaceScan
                faceScanDone={faceScanDone}
                submitLabel="Submit and finish registration"
                busy={busy}
                error={error}
                onSubmit={handleSubmit}
            />
        </div>
    );
}
