'use client';

import { PRESENCE_POINTS, TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
import Link from 'next/link';
import { useState } from 'react';

/**
 * The gate before any field is filled in.
 *
 * "Participant to be present during registration: strong communication and check
 * before registration."
 *
 * The failure this exists to prevent is expensive and silent: a parent registers
 * on the child's behalf, enrols *their own* face at step 4, and the child is then
 * flagged for identity mismatch in the middle of a real paper — by which point
 * nothing can be done without support unpicking it. So the warning comes first,
 * has to be acknowledged deliberately, and says what actually goes wrong.
 *
 * The technology requirements sit here too rather than at the end, because
 * discovering you need a webcam *after* creating an account is the wrong order.
 */
export default function PresenceStep({
    acknowledged,
    onAcknowledgedChange,
    termsAccepted,
    onTermsAcceptedChange,
    dataConsent,
    onDataConsentChange,
    onContinue,
}: {
    acknowledged: boolean;
    onAcknowledgedChange: (v: boolean) => void;
    termsAccepted: boolean;
    onTermsAcceptedChange: (v: boolean) => void;
    dataConsent: boolean;
    onDataConsentChange: (v: boolean) => void;
    onContinue: () => void;
}) {
    const [showTech, setShowTech] = useState(false);
    const ready = acknowledged && termsAccepted && dataConsent;

    return (
        <div className="auth-form register-presence">
            <div className="presence-points">
                {PRESENCE_POINTS.map((point) => (
                    <div key={point.title} className="presence-point">
                        <span className="presence-point__icon" aria-hidden="true">{point.icon}</span>
                        <div>
                            <strong className="presence-point__title">{point.title}</strong>
                            <p className="presence-point__body">{point.body}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Collapsed by default: it is a checklist to act on, not something to
                read past on the way to the form. */}
            <button
                type="button"
                className="presence-tech-toggle"
                aria-expanded={showTech}
                onClick={() => setShowTech((v) => !v)}
            >
                {showTech ? '▾' : '▸'} What you need to appear for  the olympiad exam
            </button>
            {showTech && (
                <dl className="tech-req-list">
                    {TECH_REQUIREMENTS.map((req) => (
                        <div key={req.label} className="tech-req-row">
                            <dt>{req.label}</dt>
                            <dd>{req.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            <div className="presence-checks">
                <label className="consent-check">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => onAcknowledgedChange(e.target.checked)}
                    />
                    <span>
                        <strong>The ward is here with me now, and will do the face scan himself/herself</strong>
                    </span>
                </label>

                <label className="consent-check">
                    <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => onTermsAcceptedChange(e.target.checked)}
                    />
                    <span>
                        I have read and accept the{' '}
                        <Link href="/terms" target="_blank" rel="noopener noreferrer">
                            terms &amp; conditions
                        </Link>
                        , including that the registration fee is <strong>non-refundable and
                        non-transferable</strong> and that a confirmed exam schedule cannot be changed.
                    </span>
                </label>

                <label className="consent-check">
                    <input
                        type="checkbox"
                        checked={dataConsent}
                        onChange={(e) => onDataConsentChange(e.target.checked)}
                    />
                    <span>
                        I agree that the details entered here may be processed to run the Olympiad,
                        registering the participant, proctoring their exam, marking, ranking and issuing
                        certificates, reports, as well as other programs as part of the ecosystem . A parent or guardian confirms this again later in the form.
                    </span>
                </label>
            </div>

            <button
                type="button"
                className="btn btn-primary btn-lg auth-submit"
                disabled={!ready}
                onClick={onContinue}
                title={ready ? undefined : 'Tick all three boxes to continue'}
            >
                Start registration →
            </button>
            {!ready && (
                <p className="input-hint" style={{ textAlign: 'center' }}>
                    Please tick all three boxes to continue.
                </p>
            )}
        </div>
    );
}
