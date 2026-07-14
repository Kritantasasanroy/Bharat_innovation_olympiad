'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

/**
 * Edit an exam's schedule and its slots (item 6).
 *
 * Both were previously write-once: the creation wizard set them and nothing
 * could change them afterwards, so a rescheduled exam meant deleting it and
 * losing its questions.
 *
 * The rules the server enforces, mirrored here so the form explains itself
 * rather than erroring:
 *  - a slot must sit **inside** its exam window (a slot before the exam opens can
 *    never be sat — the start gate refuses every attempt before `startsAt`);
 *  - a window cannot be narrowed so far that it strands an existing slot;
 *  - a slot's capacity cannot drop below the students already booked into it.
 */

interface Slot {
    id: string;
    label: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    booked: number;
}

interface Instance {
    id: string;
    startsAt: string;
    endsAt: string;
    requireSeb: boolean;
}

interface Exam {
    id: string;
    title: string;
    durationMinutes: number;
}

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
    const [slotsByInstance, setSlotsByInstance] = useState<Record<string, Slot[]>>({});
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

            const slots = await Promise.all(
                instRes.data.map((i) =>
                    api
                        .get<Slot[]>('/slots', { params: { examInstanceId: i.id } })
                        .then((r) => [i.id, r.data] as const),
                ),
            );
            setSlotsByInstance(Object.fromEntries(slots));
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

    const saveSlot = async (slot: Slot, patch: Partial<Slot>) => {
        try {
            setBusy(`slot-${slot.id}`);
            setError('');
            setNotice('');
            await api.put(`/admin/slots/${slot.id}`, {
                ...(patch.startsAt ? { startsAt: new Date(patch.startsAt).toISOString() } : {}),
                ...(patch.endsAt ? { endsAt: new Date(patch.endsAt).toISOString() } : {}),
                ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
                ...(patch.label !== undefined ? { label: patch.label } : {}),
            });
            setNotice('Slot updated.');
            await load();
        } catch (err) {
            setError(apiError(err, 'Could not update that slot.'));
        } finally {
            setBusy('');
        }
    };

    const addSlot = async (instance: Instance, form: HTMLFormElement) => {
        const data = new FormData(form);
        try {
            setBusy(`add-${instance.id}`);
            setError('');
            setNotice('');
            await api.post('/admin/slots', {
                examInstanceId: instance.id,
                label: String(data.get('label') || '') || undefined,
                startsAt: new Date(String(data.get('startsAt'))).toISOString(),
                endsAt: new Date(String(data.get('endsAt'))).toISOString(),
                capacity: Number(data.get('capacity')),
            });
            form.reset();
            setNotice('Slot added.');
            await load();
        } catch (err) {
            setError(apiError(err, 'Could not add that slot.'));
        } finally {
            setBusy('');
        }
    };

    const deleteSlot = async (slot: Slot) => {
        if (slot.booked > 0) return;
        if (!confirm(`Delete slot "${slot.label ?? 'unnamed'}"?`)) return;
        try {
            setBusy(`slot-${slot.id}`);
            await api.delete(`/admin/slots/${slot.id}`);
            await load();
        } catch (err) {
            setError(apiError(err, 'Could not delete that slot.'));
        } finally {
            setBusy('');
        }
    };

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header">
                    <div>
                        <h1>Schedule &amp; Slots</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                            {exam ? exam.title : 'Loading…'} — set when the exam runs, and the slots
                            students sit it in.
                        </p>
                    </div>
                    <a href="/exams" className="btn btn-secondary">
                        ← Back to exams
                    </a>
                </div>

                <div className="glass-card" style={{ marginTop: 'var(--space-6)' }}>
                    <h3 style={{ marginTop: 0 }}>How these two fit together</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                        The <strong>exam window</strong> is the outer boundary: no student can start
                        before it opens or after it closes. A <strong>slot</strong> is the specific
                        hour a school’s students sit in, and it must fall <em>inside</em> that
                        window — a slot scheduled before the exam opens can never be sat, because the
                        start gate refuses every attempt until the window is live.
                    </p>
                </div>

                {error && (
                    <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>
                        {error}
                    </div>
                )}
                {notice && (
                    <p className="hint" style={{ marginTop: 'var(--space-4)', color: 'var(--success-400)' }}>
                        ✓ {notice}
                    </p>
                )}

                {loading ? (
                    <div className="loading-container" style={{ minHeight: 300 }}>
                        <div className="spinner" />
                    </div>
                ) : instances.length === 0 ? (
                    <div className="glass-card empty-state" style={{ marginTop: 'var(--space-6)' }}>
                        <h3>No schedule yet</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            This exam has no date window, so it cannot be published. Create one with
                            the “New exam with slots” wizard, or add an instance via the API.
                        </p>
                    </div>
                ) : (
                    instances.map((instance) => (
                        <InstanceEditor
                            key={instance.id}
                            instance={instance}
                            slots={slotsByInstance[instance.id] ?? []}
                            busy={busy}
                            onSaveInstance={saveInstance}
                            onSaveSlot={saveSlot}
                            onAddSlot={addSlot}
                            onDeleteSlot={deleteSlot}
                        />
                    ))
                )}
            </main>
        </AuthGuard>
    );
}

function InstanceEditor({
    instance,
    slots,
    busy,
    onSaveInstance,
    onSaveSlot,
    onAddSlot,
    onDeleteSlot,
}: {
    instance: Instance;
    slots: Slot[];
    busy: string;
    onSaveInstance: (i: Instance, s: string, e: string) => void;
    onSaveSlot: (s: Slot, patch: Partial<Slot>) => void;
    onAddSlot: (i: Instance, form: HTMLFormElement) => void;
    onDeleteSlot: (s: Slot) => void;
}) {
    const [startsAt, setStartsAt] = useState(toLocalInput(instance.startsAt));
    const [endsAt, setEndsAt] = useState(toLocalInput(instance.endsAt));

    // Re-sync when a save reloads the row from the server.
    useEffect(() => {
        setStartsAt(toLocalInput(instance.startsAt));
        setEndsAt(toLocalInput(instance.endsAt));
    }, [instance.startsAt, instance.endsAt]);

    const dirty =
        startsAt !== toLocalInput(instance.startsAt) || endsAt !== toLocalInput(instance.endsAt);

    return (
        <div className="glass-card" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginTop: 0 }}>Exam window</h3>

            <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                <div className="form-group">
                    <label>Opens *</label>
                    <input
                        type="datetime-local"
                        className="form-control"
                        value={startsAt}
                        onChange={(e) => setStartsAt(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label>Closes *</label>
                    <input
                        type="datetime-local"
                        className="form-control"
                        value={endsAt}
                        onChange={(e) => setEndsAt(e.target.value)}
                    />
                </div>
            </div>

            <button
                className="btn btn-primary btn-sm"
                disabled={!dirty || busy === `inst-${instance.id}`}
                onClick={() => onSaveInstance(instance, startsAt, endsAt)}
            >
                {busy === `inst-${instance.id}` ? 'Saving…' : 'Save window'}
            </button>

            <h3 style={{ marginTop: 'var(--space-8)' }}>
                Slots <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({slots.length})</span>
            </h3>

            {slots.length === 0 ? (
                <p className="hint hint-warn">
                    No slots. Students cannot be allocated to this exam until it has at least one.
                </p>
            ) : (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Label</th>
                                <th>Starts</th>
                                <th>Ends</th>
                                <th>Capacity</th>
                                <th>Booked</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {slots.map((slot) => (
                                <SlotRow
                                    key={slot.id}
                                    slot={slot}
                                    busy={busy}
                                    onSave={onSaveSlot}
                                    onDelete={onDeleteSlot}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <form
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    onAddSlot(instance, e.currentTarget);
                }}
                style={{ marginTop: 'var(--space-6)' }}
            >
                <h4 style={{ marginBottom: 'var(--space-3)' }}>Add a slot</h4>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1.2fr 1.2fr 0.7fr auto',
                        gap: 'var(--space-3)',
                        alignItems: 'end',
                    }}
                >
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>Label</label>
                        <input name="label" className="form-control" placeholder="Slot 1" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>Starts *</label>
                        <input
                            name="startsAt"
                            type="datetime-local"
                            className="form-control"
                            required
                            // Bounded to the exam window, so the browser refuses an
                            // out-of-window slot before the server has to.
                            min={toLocalInput(instance.startsAt)}
                            max={toLocalInput(instance.endsAt)}
                            defaultValue={toLocalInput(instance.startsAt)}
                        />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>Ends *</label>
                        <input
                            name="endsAt"
                            type="datetime-local"
                            className="form-control"
                            required
                            min={toLocalInput(instance.startsAt)}
                            max={toLocalInput(instance.endsAt)}
                            defaultValue={toLocalInput(instance.endsAt)}
                        />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label>Capacity *</label>
                        <input
                            name="capacity"
                            type="number"
                            className="form-control"
                            required
                            min={1}
                            defaultValue={50}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={busy === `add-${instance.id}`}
                    >
                        {busy === `add-${instance.id}` ? 'Adding…' : '+ Add'}
                    </button>
                </div>
                <p className="hint hint-muted" style={{ marginTop: 'var(--space-2)' }}>
                    A slot must start no earlier than the exam opens and end no later than it closes.
                </p>
            </form>
        </div>
    );
}

function SlotRow({
    slot,
    busy,
    onSave,
    onDelete,
}: {
    slot: Slot;
    busy: string;
    onSave: (s: Slot, patch: Partial<Slot>) => void;
    onDelete: (s: Slot) => void;
}) {
    const [label, setLabel] = useState(slot.label ?? '');
    const [startsAt, setStartsAt] = useState(toLocalInput(slot.startsAt));
    const [endsAt, setEndsAt] = useState(toLocalInput(slot.endsAt));
    const [capacity, setCapacity] = useState(slot.capacity);

    useEffect(() => {
        setLabel(slot.label ?? '');
        setStartsAt(toLocalInput(slot.startsAt));
        setEndsAt(toLocalInput(slot.endsAt));
        setCapacity(slot.capacity);
    }, [slot.label, slot.startsAt, slot.endsAt, slot.capacity]);

    const dirty =
        label !== (slot.label ?? '') ||
        startsAt !== toLocalInput(slot.startsAt) ||
        endsAt !== toLocalInput(slot.endsAt) ||
        capacity !== slot.capacity;

    return (
        <tr>
            <td>
                <input
                    className="form-control"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                />
            </td>
            <td>
                <input
                    type="datetime-local"
                    className="form-control"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                />
            </td>
            <td>
                <input
                    type="datetime-local"
                    className="form-control"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                />
            </td>
            <td>
                <input
                    type="number"
                    className="form-control"
                    // Capacity can never drop below the students already in the slot.
                    min={slot.booked}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                />
            </td>
            <td>
                <span className={slot.booked >= slot.capacity ? 'badge badge-warning' : 'badge badge-muted'}>
                    {slot.booked} / {slot.capacity}
                </span>
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
                <button
                    className="btn btn-primary btn-sm"
                    disabled={!dirty || busy === `slot-${slot.id}`}
                    onClick={() => onSave(slot, { label, startsAt, endsAt, capacity })}
                >
                    Save
                </button>{' '}
                <button
                    className="btn btn-danger btn-sm"
                    // A slot with bookings is not deletable — those students would
                    // silently lose their place.
                    disabled={slot.booked > 0 || busy === `slot-${slot.id}`}
                    title={slot.booked > 0 ? 'This slot has bookings. Move them first.' : undefined}
                    onClick={() => onDelete(slot)}
                >
                    Delete
                </button>
            </td>
        </tr>
    );
}
