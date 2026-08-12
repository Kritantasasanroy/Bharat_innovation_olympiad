'use client';

import api from '@/lib/api';
import { describeError, describeOversizeFile } from '@/lib/errors';
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

/**
 * Accepted ID documents, **in order of preference**.
 *
 * School ID comes first and is the default, and the order here is the order on
 * screen. It is the right document for this purpose and the wrong default was
 * doing real harm in both directions: a school ID proves the one thing the
 * olympiad actually needs to check — that this student attends the school and
 * class they registered under — which a passport does not show at all. And
 * Aadhaar is a national identity number belonging to a minor; collecting one by
 * default, when a card the school itself issued would do, is more of a child's
 * data than the task requires.
 *
 * The other two stay, because a student between schools or without a card
 * issued yet must still be able to register.
 */
export const ID_DOC_TYPES = ['School ID Card', 'Aadhaar Card', 'Passport'] as const;

/** Mirrors `DOCUMENT_RULES.maxBytes` on the server, so the reject is instant. */
const MAX_DOCUMENT_MB = 10;
const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024;

export interface GuardianFormValues {
    guardianFirstName: string;
    guardianLastName: string;
    relationship: string;
    guardianEmail: string;
    guardianPhone: string;
    studentDob: string;
    // Kept so an existing profile's values survive a re-submit from `/guardian`;
    // no longer collected by the form, and `pincode` is gone from the database.
    city: string;
    state: string;
    gender: string;
    idDocumentType: string;
    /** Front of the card. */
    idDocumentUrl: string;
    /** Back of the card. Required, same as the front. */
    idDocumentBackUrl: string;
    parentalConsent: boolean;
    dataConsent: boolean;
}

/** Which side of the ID an upload control is for. */
type IdSide = 'front' | 'back';

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
    // The preferred document — see ID_DOC_TYPES.
    idDocumentType: 'School ID Card',
    idDocumentUrl: '',
    idDocumentBackUrl: '',
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
    const [localError, setLocalError] = useState('');
    /**
     * Upload state is per side.
     *
     * A single set of `fileName`/`uploading`/`uploadError` would have the two
     * controls overwrite each other: picking the back would blank the "✓
     * Uploaded" line under the front, which reads exactly like the front having
     * been lost, and a parent would re-upload it.
     */
    const [fileName, setFileName] = useState<Record<IdSide, string>>({ front: '', back: '' });
    const [uploading, setUploading] = useState<Record<IdSide, boolean>>({ front: false, back: false });
    const [uploadError, setUploadError] = useState<Record<IdSide, string>>({ front: '', back: '' });

    // Re-seed if the parent component loads an existing profile after first paint.
    useEffect(() => {
        if (initial) setValues((v) => ({ ...v, ...initial }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial?.guardianEmail, initial?.guardianPhone]);

    // The pincode → city/state lookup lived here. Removed along with those three
    // fields; `lookupPincode` is still used by the school picker.

    const set = <K extends keyof GuardianFormValues>(key: K, value: GuardianFormValues[K]) =>
        setValues((v) => ({ ...v, [key]: value }));

    /**
     * Uploads the ID document and keeps only the resulting URL.
     *
     * It used to `readAsDataURL` and put the base64 straight into
     * `idDocumentUrl`, which then rode along in the JSON body of `POST
     * /guardian`. A phone photo of an ID is 2–5 MB and base64 adds a third
     * again, so every submission with a document attached came back
     * "request entity too large" and the parent could not finish registering.
     *
     * The file now goes to object storage over multipart and never enters the
     * JSON body at all.
     */
    const handleFileUpload = (side: IdSide) => async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const field: keyof GuardianFormValues =
            side === 'front' ? 'idDocumentUrl' : 'idDocumentBackUrl';

        setLocalError('');
        setUploadError((s) => ({ ...s, [side]: '' }));

        if (file.size > MAX_DOCUMENT_BYTES) {
            setUploadError((s) => ({ ...s, [side]: describeOversizeFile(file.size, MAX_DOCUMENT_BYTES) }));
            e.target.value = '';
            return;
        }

        setFileName((s) => ({ ...s, [side]: file.name }));
        setUploading((s) => ({ ...s, [side]: true }));
        try {
            const form = new FormData();
            form.append('file', file);
            // No explicit Content-Type: the browser has to set the multipart
            // boundary itself, and naming the header would strip it.
            const { data } = await api.post<{ url: string }>('/guardian/id-document', form);
            set(field, data.url);
        } catch (err: any) {
            setFileName((s) => ({ ...s, [side]: '' }));
            set(field, '');
            e.target.value = '';
            setUploadError((s) => ({ ...s, [side]: describeError(err, 'upload that document') }));
        } finally {
            setUploading((s) => ({ ...s, [side]: false }));
        }
    };

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
        // Nothing on this form is optional any more. Checked one at a time, in
        // the order the fields appear, so the message always names the first
        // thing the parent needs to scroll back to rather than listing five.
        if (!values.studentDob) {
            setLocalError("Enter the student's date of birth.");
            return;
        }
        if (!values.gender) {
            setLocalError("Select the student's gender.");
            return;
        }
        if (uploading.front || uploading.back) {
            setLocalError('Wait for the document to finish uploading.');
            return;
        }
        if (!values.idDocumentUrl) {
            setLocalError(
                `Upload the front of the student's ${values.idDocumentType.toLowerCase()}.`,
            );
            return;
        }
        if (!values.idDocumentBackUrl) {
            setLocalError(
                `Upload the back of the student's ${values.idDocumentType.toLowerCase()} as well. Both sides are needed.`,
            );
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
                    We use these to reach you about the student&apos;s exam, not for marketing.
                </p>
            </fieldset>

            <fieldset className="guardian-fieldset">
                <legend>About the student (Mandatory)</legend>
                <p className="input-hint" style={{ marginTop: 0 }}>
                    Both are required. Neither affects the student&apos;s score or rank — the date
                    of birth has to match the ID you upload below, which is how we confirm the
                    student is who they registered as.
                </p>

                <div className="form-row">
                    <div className="input-group">
                        <label className="input-label" htmlFor="studentDob">Date of birth</label>
                        <input
                            id="studentDob" className="input-field" type="date"
                            required
                            max={new Date().toISOString().slice(0, 10)}
                            value={values.studentDob}
                            onChange={(e) => set('studentDob', e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="gender">Gender</label>
                        <select
                            id="gender" className="input-field"
                            required
                            value={values.gender}
                            onChange={(e) => set('gender', e.target.value)}
                        >
                            {/* No blank default. "Prefer not to say" is a real
                                answer and is in GENDERS; an empty option that
                                looked identical to it just made the field
                                skippable while appearing answered. */}
                            <option value="" disabled>Select…</option>
                            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>

                {/* Pincode, city and state were here. Removed — the school
                    already carries a location, so asking a parent for it again
                    added three fields to the longest step of registration for
                    nothing. The columns stay on `GuardianProfile` so existing
                    rows keep their data; nothing new is collected. */}
            </fieldset>

            <fieldset className="guardian-fieldset">
                <legend>Student Identity Document (Mandatory)</legend>
                {/* The preference is stated, not merely implied by the order of
                    a dropdown. A parent reaching for Aadhaar by habit needs a
                    reason to reach for the school card instead, and "it is the
                    one that proves the class you registered under" is that
                    reason. */}
                <p className="input-hint" style={{ marginTop: 0 }}>
                    <strong>Please use the student&apos;s school ID card if you have one.</strong>{' '}
                    It is the document we prefer, because it shows the school and class the student
                    registered under. If there is no school card, an Aadhaar card or passport is
                    accepted instead.
                </p>
                <p className="input-hint">
                    <strong>Both sides are required.</strong> The back of a school card usually
                    carries the class, section and the school&apos;s stamp, and the back of an
                    Aadhaar card carries the address, so one side on its own is not enough to check.
                </p>

                <div className="input-group">
                    <label className="input-label" htmlFor="idDocumentType">Document type</label>
                    <select
                        id="idDocumentType" className="input-field"
                        value={values.idDocumentType}
                        onChange={(e) => set('idDocumentType', e.target.value)}
                    >
                        {ID_DOC_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                                {t === 'School ID Card' ? ' — preferred' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-row">
                    {(['front', 'back'] as const).map((side) => {
                        const url = side === 'front' ? values.idDocumentUrl : values.idDocumentBackUrl;
                        return (
                            <div className="input-group" key={side}>
                                {/* The limit is in the label, not only in the
                                    error — a parent should know it before they
                                    pick a 12 MB photo, not after waiting for it
                                    to be refused. */}
                                <label className="input-label" htmlFor={`idDocument-${side}`}>
                                    {side === 'front' ? 'Front of the card' : 'Back of the card'}{' '}
                                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                                        (JPG, PNG, HEIC or PDF · max {MAX_DOCUMENT_MB} MB)
                                    </span>
                                </label>
                                <input
                                    id={`idDocument-${side}`} className="input-field" type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleFileUpload(side)}
                                    disabled={uploading[side]}
                                    style={{ padding: '0.4rem' }}
                                />
                                {uploading[side] && (
                                    <p className="input-hint">Uploading {fileName[side]}…</p>
                                )}
                                {!uploading[side] && url && (
                                    <p className="input-hint" style={{ color: '#22c55e', fontWeight: 500 }}>
                                        ✓ Uploaded{fileName[side] ? `: ${fileName[side]}` : ''}
                                    </p>
                                )}
                                {uploadError[side] && (
                                    <p className="input-hint" style={{ color: 'var(--danger-400)', fontWeight: 500 }}>
                                        {uploadError[side]}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <p className="input-hint">
                    A clear phone photo of each side is fine, it does not need to be a scan. If a
                    photo is over {MAX_DOCUMENT_MB} MB, retake it at a lower resolution.
                </p>
            </fieldset>

            <fieldset className="guardian-fieldset guardian-fieldset--consent">
                <legend>Consent: both are required</legend>

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
                        runs in their own browser, that no video is ever recorded or stored, and
                        that a still photo is saved only at the moment an exam violation is
                        recorded, to be reviewed by a person alongside that paper.
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
                        face template and their exam records, for running the Olympiad: identifying
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

            <button
                type="submit"
                className="btn btn-primary btn-lg auth-submit"
                disabled={busy || uploading.front || uploading.back || !bothConsents}
            >
                {busy ? 'Saving…' : submitLabel}
            </button>
        </form>
    );
}
