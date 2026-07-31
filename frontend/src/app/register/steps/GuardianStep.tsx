'use client';

import GuardianForm, { GuardianFormValues } from '@/components/GuardianForm';
import api from '@/lib/api';
import { useState } from 'react';

/**
 * Registration step 5 — the parent/guardian section.
 *
 * A thin wrapper over the shared `GuardianForm` so this and the standalone
 * `/guardian` page collect identical fields and show identical consent wording.
 */
export default function GuardianStep({
    studentName,
    onDone,
}: {
    studentName?: string;
    onDone: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (values: GuardianFormValues) => {
        setBusy(true);
        setError('');
        try {
            await api.post('/guardian', {
                ...values,
                // Blank optional fields are omitted rather than sent as '' — an
                // empty string is not a valid ISO date and would fail validation
                // for the whole form.
                studentDob: values.studentDob || undefined,
                gender: values.gender || undefined,
                city: values.city || undefined,
                state: values.state || undefined,
                pincode: values.pincode || undefined,
            });
            onDone();
        } catch (err: any) {
            setError(
                err?.response?.data?.message ??
                    'Could not save these details. Check them and try again.',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <GuardianForm
            studentName={studentName}
            submitLabel="Save parent details and finish registration"
            busy={busy}
            error={error}
            onSubmit={handleSubmit}
        />
    );
}
