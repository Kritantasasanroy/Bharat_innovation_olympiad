'use client';

import { lookupPincode } from '@/lib/schools';
import { FormEvent, useEffect, useState } from 'react';

/**
 * Registration part 2 — the parent/guardian section.
 *
 * Shared by the registration flow (as step 5) and by `/guardian`, which is where
 * a student who registered before this existed is sent when the exam gate refuses
 * them with `GUARDIAN_CONSENT_REQUIRED`. One component, so the two can never
 * collect different fields or show different consent wording.
 *
 * The two consents are separate checkboxes on purpose: consenting to a child
 * *taking part* is not the same as consenting to their *data being processed*,
 * and the DPDP Act treats them as distinct permissions. The server rejects a
 * submission with either unticked, so this mirrors the rule rather than owning it.
 */

export const RELATIONSHIPS = ['Mother', 'Father', 'Legal guardian', 'Other'] as const;
export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'] as const;

const PINCODE_LENGTH = 6;

export interface GuardianFormValues {
    guardianFirstName: string;
    guardianLastName: string;
    relationship: string;
    guardianEmail: string;
    guardianPhone: string;
    studentDob: string;
    gender: string;
    city: string;
    state: string;
    pincode: string;
    parentalConsent: boolean;
    dataConsent: boolean;
}

export const EMPTY_GUARDIAN: GuardianFormValues = {
    guardianFirstName: '',
    guardianLastName: '',
    relationship: 'Mother',
    guardianEmail: '',
    guardianPhone: '',
    studentDob: '',
    gender: '',
    city: '',
    state: '',
    pincode: '',
    parentalConsent: false,
    dataConsent: false,
};

export default function GuardianForm({
    studentName,
    initial,
    submitLabel,
    busy,
    error,
    onSubmit,
}: {
    /** Named in the consent wording so a parent knows exactly who they are consenting for. */
    studentName?: string;
    initial?: Partial<GuardianFormValues>;
    submitLabel: string;
    busy: boolean;
    error?: string;
    onSubmit: (values: GuardianFormValues) => void | Promise<void>;
}) {
    const [values, setValues] = useState<GuardianFormValues>({ ...EMPTY_GUARDIAN, ...initial });
    const [locating, setLocating] = useState(false);
    const [localError, setLocalError] = useState('');

    // Re-seed if the parent component loads an existing profile after first paint.
    useEffect(() => {
        if (initial) setValues((v) => ({ ...v, ...initial }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial?.guardianEmail, initial?.guardianPhone]);

    // City and state from the pincode, so nobody types them — same helper the
    // school picker uses, so both agree about where a pincode is.
    useEffect(() => {
        if (values.pincode.length !== PINCODE_LENGTH) return;
        let cancelled = false;
        setLocating(true);
        lookupPincode(values.pincode)
            .then((found) => {
                if (cancelled) return;
                setValues((v) => ({ ...v, city: found.city, state: found.state }));
            })
            .catch(() => {
                // Non-fatal — the fields stay editable by hand. A pincode service
                // outage must not block a registration.
            })
            .finally(() => !cancelled && setLocating(false));
        return () => {
            cancelled = true;
        };
    }, [values.pincode]);

    const set = <K extends keyof GuardianFormValues>(key: K, value: GuardianFormValues[K]) =>
        setValues((v) => ({ ...v, [key]: value }));

    const bothConsents = values.parentalConsent && values.dataConsent;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLocalError('');

        if (!values.guardianFirstName.trim() || !values.guardianLastName.trim()) {
            setLocalError("Enter the parent or guardian's full name.");
            return;
        }
        if (!values.guardianEmail.trim()) {
            setLocalError("Enter the parent or guardian's email address.");
            return;
        }
        if (!values.guardianPhone.trim()) {
            setLocalError("Enter the parent or guardian's mobile number.");
            return;
        }
        if (!bothConsents) {
            setLocalError('Both consents are required before the student can sit an exam.');
            return;
        }
        await onSubmit(values);
    };

    const shown = error || localError;

    return (
        <form onSubmit={handleSubmit} className="auth-form guardian-form">
            {shown && <div className="auth-error">{shown}</div>}

            <p className="guardian-form__lede">
                This section is for a parent or legal guardian. It is required before
                {studentName ? ` ${studentName}` : ' the student'} can sit an exam.
            </p>

            <fieldset className="guardian-fieldset">
                <legend>Parent or guardian</legend>

                <div className="form-row">
                    <div className="input-group">
                        <label className="input-label" htmlFor="guardianFirstName">First name</label>
                        <input
                            id="guardianFirstName" className="input-field" type="text" required
                            autoComplete="off" maxLength={80}
                            value={values.guardianFirstName}
                            onChange={(e) => set('guardianFirstName', e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="guardianLastName">Last name</label>
                        <input
                            id="guardianLastName" className="input-field" type="text" required
                            autoComplete="off" maxLength={80}
                            value={values.guardianLastName}
                            onChange={(e) => set('guardianLastName', e.target.value)}
                        />
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label" htmlFor="relationship">Relationship to the student</label>
                    <select
                        id="relationship" className="input-field"
                        value={values.relationship}
                        onChange={(e) => set('relationship', e.target.value)}
                    >
                        {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>

                <div className="form-row">
                    <div className="input-group">
                        <label className="input-label" htmlFor="guardianEmail">Email address</label>
                        <input
                            id="guardianEmail" className="input-field" type="email" required
                            inputMode="email" autoComplete="email" placeholder="parent@example.com"
                            value={values.guardianEmail}
                            onChange={(e) => set('guardianEmail', e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="guardianPhone">Mobile number</label>
                        <input
                            id="guardianPhone" className="input-field" type="tel" required
                            inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210"
                            value={values.guardianPhone}
                            onChange={(e) => set('guardianPhone', e.target.value)}
                        />
                    </div>
                </div>
                <p className="input-hint">
                    We use these to reach you about the student&apos;s exam — not for marketing.
                </p>
            </fieldset>

            <fieldset className="guardian-fieldset">
                <legend>
                    About the student <span className="guardian-optional">optional</span>
                </legend>
                <p className="input-hint" style={{ marginTop: 0 }}>
                    These help us report on who is taking part. Nothing here affects the
                    student&apos;s exam, score or rank, and every field can be left blank.
                </p>

                <div className="form-row">
                    <div className="input-group">
                        <label className="input-label" htmlFor="studentDob">Date of birth</label>
                        <input
                            id="studentDob" className="input-field" type="date"
                            max={new Date().toISOString().slice(0, 10)}
                            value={values.studentDob}
                            onChange={(e) => set('studentDob', e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="gender">Gender</label>
                        <select
                            id="gender" className="input-field"
                            value={values.gender}
                            onChange={(e) => set('gender', e.target.value)}
                        >
                            <option value="">Prefer not to say</option>
                            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>

                <div className="form-row">
                    <div className="input-group">
                        <label className="input-label" htmlFor="guardianPincode">Pincode</label>
                        <input
                            id="guardianPincode" className="input-field" inputMode="numeric"
                            maxLength={PINCODE_LENGTH} placeholder="440001"
                            value={values.pincode}
                            onChange={(e) =>
                                set('pincode', e.target.value.replace(/\D/g, '').slice(0, PINCODE_LENGTH))
                            }
                        />
                        <p className="input-hint">
                            {locating ? 'Looking up your pincode…' : 'City and state fill in from this.'}
                        </p>
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="guardianCity">City</label>
                        <input
                            id="guardianCity" className="input-field" type="text" maxLength={80}
                            value={values.city}
                            onChange={(e) => set('city', e.target.value)}
                        />
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label" htmlFor="guardianState">State</label>
                    <input
                        id="guardianState" className="input-field" type="text" maxLength={80}
                        value={values.state}
                        onChange={(e) => set('state', e.target.value)}
                    />
                </div>
            </fieldset>

            <fieldset className="guardian-fieldset guardian-fieldset--consent">
                <legend>Consent — both are required</legend>

                <label className="consent-check">
                    <input
                        type="checkbox"
                        checked={values.parentalConsent}
                        onChange={(e) => set('parentalConsent', e.target.checked)}
                    />
                    <span>
                        <strong>I consent to my child taking part.</strong> I am the parent or legal
                        guardian of{studentName ? <> <strong>{studentName}</strong></> : ' this student'}, and
                        I consent to them sitting the Bharat Innovation Olympiad under AI-assisted
                        proctoring. I understand the webcam stays on for the exam, that face analysis
                        runs in their own browser, and that no video is recorded or stored.
                    </span>
                </label>

                <label className="consent-check">
                    <input
                        type="checkbox"
                        checked={values.dataConsent}
                        onChange={(e) => set('dataConsent', e.target.checked)}
                    />
                    <span>
                        <strong>I consent to their personal data being processed.</strong> As required
                        by the Digital Personal Data Protection Act, 2023 for a child&apos;s data, I
                        consent to the collection and use of the details on this form, my child&apos;s
                        face template and their exam records, for running the Olympiad — identifying
                        them, proctoring, marking, ranking, certificates, and contacting us about it.
                        I understand I can withdraw this consent at any time.
                    </span>
                </label>

                {!bothConsents && (
                    <p className="input-hint">
                        Both boxes must be ticked. Without them the student cannot start an exam.
                    </p>
                )}
            </fieldset>

            <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={busy || !bothConsents}>
                {busy ? 'Saving…' : submitLabel}
            </button>
        </form>
    );
}
