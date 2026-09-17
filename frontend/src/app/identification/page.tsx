'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import IdentificationForm, { IdentificationFormValues } from '@/components/IdentificationForm';
import api from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { IdentificationStatus } from '@/types/user';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * Student identification, on its own page.
 *
 * Where a student lands when the exam gate refuses them with
 * `GUARDIAN_CONSENT_REQUIRED` — either because they registered before this
 * existed, or because the consent wording has been revised since they signed it.
 * The page is the participant's own identification only: date of birth, gender,
 * the ID document, and the two consents — no parent/guardian details.
 *
 * `?next=` carries them back where they came from, so a student sent here from an
 * exam's instructions page returns to it rather than being dumped on the
 * dashboard to find their way back.
 */
function IdentificationPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') ?? '/dashboard';
    const user = useAuthStore((s) => s.user);

    const [status, setStatus] = useState<IdentificationStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    /**
     * Set when a student with an already-complete profile asks to change it.
     * Keeps the loaded profile around to prefill the form — clearing `status`
     * would show them an empty form and make them retype everything.
     */
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        api.get<IdentificationStatus>('/identification/me')
            .then(({ data }) => setStatus(data))
            .catch((err) => setError(describeError(err, 'load this form')))
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (values: IdentificationFormValues) => {
        setBusy(true);
        setError('');
        try {
            await api.post('/identification', {
                ...values,
                // Only send a date if one was picked — an empty string is not a
                // valid ISO date and the server would reject the whole form.
                studentDob: values.studentDob || undefined,
                gender: values.gender || undefined,
                city: values.city || undefined,
                state: values.state || undefined,
            });
            setSaved(true);
        } catch (err: any) {
            setError(describeError(err, 'save the identification details'));
        } finally {
            setBusy(false);
        }
    };

    const studentName = user ? `${user.firstName} ${user.lastName}`.trim() : undefined;

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
            </div>
        );
    }

    if (!editing && (saved || status?.complete)) {
        return (
            <main className="container page-content animate-fade-in" style={{ maxWidth: '720px' }}>
                <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                    <div className="flex items-center gap-3">
                        <span style={{ fontSize: '1.8rem' }}>✅</span>
                        <div>
                            <h2 style={{ margin: 0 }}>Identification complete</h2>
                            <p className="text-muted" style={{ margin: 0 }}>
                                {saved
                                    ? 'Thank you. You can now take the Olympiad exam'
                                    : 'This is already complete, there is nothing more to do here.'}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => router.push(next)}>
                            Continue
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setSaved(false);
                                setEditing(true);
                            }}
                        >
                            Update the details
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="container page-content animate-fade-in" style={{ maxWidth: '720px' }}>
            <div className="page-header">
                <h1>Student identification</h1>
                <p className="text-muted">
                    One more step before an exam can be started. It takes about two minutes and is
                    one-time only.
                </p>
            </div>

            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                <IdentificationForm
                    studentName={studentName}
                    initial={
                        status?.profile
                            ? {
                                  studentDob: status.profile.studentDob?.slice(0, 10) ?? '',
                                  gender: status.profile.gender ?? '',
                                  city: status.profile.city ?? '',
                                  state: status.profile.state ?? '',
                                  idDocumentType: status.profile.idDocumentType ?? '',
                              }
                            : undefined
                    }
                    submitLabel="Save and continue"
                    busy={busy}
                    error={error}
                    onSubmit={handleSubmit}
                />
            </div>
        </main>
    );
}

export default function IdentificationPage() {
    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <Suspense fallback={<div className="loading-container"><div className="spinner" /></div>}>
                <IdentificationPageInner />
            </Suspense>
        </AuthGuard>
    );
}
