'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

/**
 * Edit an exam's window (item 6).
 *
 * The window is the outer boundary: nothing can be sat before it opens or after
 * it closes, whatever a participant's own sitting says. It used to be
 * write-once, set by the creation wizard and unchangeable afterwards, so a
 * rescheduled exam meant deleting it and losing its questions.
 *
 * Sittings are deliberately *not* edited here. They belong to the auto-assigner,
 * are configured as recurring timings rather than dates, and live on the Exam
 * scheduling page — two screens that could both edit them is exactly how the
 * timings and the dated sittings drift apart.
 *
 * The one rule the server enforces that this page has to explain: a window
 * cannot be narrowed so far that it strands a sitting participants are already
 * booked into.
 */

interface Instance {
    id: string;
    startsAt: string;
    endsAt: string;
    requireSeb: boolean;
    slotLeadDays: number;
    slotHorizonDays: number;
    slotDayPreference: number[];
    _count?: { slots: number };
}

interface Exam {
    id: string;
    title: string;
    durationMinutes: number;
}

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time, not an ISO-Z string. */
const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const apiError = (err: unknown, fallback: string): string => {
    const message = (err as { response?: { data?: { message?: string | string[] } } })?.response
        ?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    return message || fallback;
};

export default function ExamSchedulePage() {
    const params = useParams();
    const examId = String(params.id);

    const [exam, setExam] = useState<Exam | null>(null);
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [examRes, instRes] = await Promise.all([
                api.get<Exam[]>('/admin/exams'),
                api.get<Instance[]>(`/admin/exams/${examId}/instances`),
            ]);
            setExam(examRes.data.find((e) => e.id === examId) ?? null);
            setInstances(instRes.data);
        } catch (err) {
            setError(apiError(err, 'Could not load this exam’s schedule.'));
        } finally {
            setLoading(false);
        }
    }, [examId]);

    useEffect(() => {
        load();
    }, [load]);

    const saveInstance = async (instance: Instance, startsAt: string, endsAt: string) => {
        try {
            setBusy(`inst-${instance.id}`);
            setError('');
            setNotice('');
            await api.put(`/admin/instances/${instance.id}`, {
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
            });
            setNotice('Exam window updated.');
            await load();
        } catch (err) {
            setError(apiError(err, 'Could not update the exam window.'));
        } finally {
            setBusy('');
        }
    };

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content">
                <div className="page-header">
                    <h1>Exam window</h1>
                    <p className="text-muted">
                        {exam ? exam.title : 'Loading…'} — the outer dates this exam runs between.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}
                {notice && (
                    <div
                        className="glass-card"
                        style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', fontSize: '0.9rem' }}
                    >
                        {notice}
                    </div>
                )}

                <div
                    className="glass-card"
                    style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}
                >
                    <p className="text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                        The <strong>window</strong> bounds the whole exam: nothing can be started
                        before it opens or after it closes, whatever date a participant holds. The
                        individual <strong>sittings</strong> inside it are set up on the{' '}
                        <Link href="/slots" style={{ color: 'var(--primary-400)' }}>
                            Exam scheduling
                        </Link>{' '}
                        page — they recur on the days you choose and are created for each date as
                        participants are assigned to them.
                    </p>
                </div>

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : instances.length === 0 ? (
                    <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                        <p className="text-muted">
                            This exam has no scheduled window yet. Create one with the “New exam”
                            wizard, or add an instance via the API.
                        </p>
                    </div>
                ) : (
                    instances.map((instance) => (
                        <InstanceCard
                            key={instance.id}
                            instance={instance}
                            busy={busy}
                            onSave={saveInstance}
                        />
                    ))
                )}
            </main>
        </AuthGuard>
    );
}

function InstanceCard({
    instance,
    busy,
    onSave,
}: {
    instance: Instance;
    busy: string;
    onSave: (i: Instance, startsAt: string, endsAt: string) => void;
}) {
    const [startsAt, setStartsAt] = useState(toLocalInput(instance.startsAt));
    const [endsAt, setEndsAt] = useState(toLocalInput(instance.endsAt));

    useEffect(() => {
        setStartsAt(toLocalInput(instance.startsAt));
        setEndsAt(toLocalInput(instance.endsAt));
    }, [instance.startsAt, instance.endsAt]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        onSave(instance, startsAt, endsAt);
    };

    const preference = instance.slotDayPreference ?? [];

    return (
        <div className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
            <form onSubmit={submit}>
                <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                    <div className="form-group">
                        <label>Opens</label>
                        <input
                            type="datetime-local"
                            className="form-control"
                            value={startsAt}
                            onChange={(e) => setStartsAt(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Closes</label>
                        <input
                            type="datetime-local"
                            className="form-control"
                            value={endsAt}
                            onChange={(e) => setEndsAt(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                    Narrowing this window is refused if it would strand a sitting participants are
                    already assigned to — move or delete those sittings first.
                    {preference.length > 0 && (
                        <>
                            {' '}
                            Participants are currently scheduled {instance.slotLeadDays}–
                            {instance.slotHorizonDays} days after they register, preferring{' '}
                            {preference.map((d) => `${WEEKDAY_FULL[d]}s`).join(', then ')}.
                        </>
                    )}
                </p>

                <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={busy === `inst-${instance.id}`}
                >
                    {busy === `inst-${instance.id}` ? 'Saving…' : 'Save window'}
                </button>
            </form>
        </div>
    );
}
