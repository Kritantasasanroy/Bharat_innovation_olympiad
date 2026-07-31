'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import GuardianForm, { GuardianFormValues } from '@/components/GuardianForm';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { GuardianStatus } from '@/types/user';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * Registration part 2, on its own page.
 *
 * Where a student lands when the exam gate refuses them with
 * `GUARDIAN_CONSENT_REQUIRED` — either because they registered before this
 * existed, or because the consent wording has been revised since they signed it.
 *
 * `?next=` carries them back where they came from, so a student sent here from an
 * exam's instructions page returns to it rather than being dumped on the
 * dashboard to find their way back.
 */
function GuardianPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') ?? '/dashboard';
    const user = useAuthStore((s) => s.user);

    const [status, setStatus] = useState<GuardianStatus | null>(null);
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
        api.get<GuardianStatus>('/guardian/me')
            .then(({ data }) => setStatus(data))
            .catch(() => setError('Could not load the form. Please refresh and try again.'))
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (values: GuardianFormValues) => {
        setBusy(true);
        setError('');
        try {
            await api.post('/guardian', {
                ...values,
                // Only send a date if one was picked — an empty string is not a
                // valid ISO date and the server would reject the whole form.
                studentDob: values.studentDob || undefined,
                gender: values.gender || undefined,
                city: values.city || undefined,
                state: values.state || undefined,
                pincode: values.pincode || undefined,
            });
            setSaved(true);
        } catch (err: any) {
            setError(
                err?.response?.data?.message ??
                    'Could not save the form. Check your details and try again.',
            );
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
                            <h2 style={{ margin: 0 }}>Parent consent recorded</h2>
                            <p className="text-muted" style={{ margin: 0 }}>
                                {saved
                                    ? 'Thank you. The student can now sit their exams.'
                                    : 'This is already complete — there is nothing more to do here.'}
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
                <h1>Parent / guardian details</h1>
                <p className="text-muted">
                    One more step before an exam can be started. It takes about two minutes, and only
                    needs doing once.
                </p>
            </div>

            {/* Says why they are here, so it does not read as an arbitrary new hurdle. */}
            <div
                className="glass-card"
                style={{ padding: '1rem 1.25rem', marginBottom: 'var(--space-5)', borderLeft: '4px solid var(--color-primary)' }}
            >
                <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                    Every participant is a school student, so the law requires a parent or guardian
                    to consent before we can proctor an exam or process their data. You can read what
                    that covers in the{' '}
                    <Link href="/terms" target="_blank" rel="noopener noreferrer">
                        terms &amp; conditions
                    </Link>
                    .
                </p>
            </div>

            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                <GuardianForm
                    studentName={studentName}
                    initial={
                        status?.profile
                            ? {
                                  guardianFirstName: status.profile.guardianFirstName,
                                  guardianLastName: status.profile.guardianLastName,
                                  relationship: status.profile.relationship,
                                  guardianEmail: status.profile.guardianEmail,
                                  guardianPhone: status.profile.guardianPhone,
                                  studentDob: status.profile.studentDob?.slice(0, 10) ?? '',
                                  gender: status.profile.gender ?? '',
                                  city: status.profile.city ?? '',
                                  state: status.profile.state ?? '',
                                  pincode: status.profile.pincode ?? '',
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

export default function GuardianPage() {
    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <Suspense fallback={<div className="loading-container"><div className="spinner" /></div>}>
                <GuardianPageInner />
            </Suspense>
        </AuthGuard>
    );
}
