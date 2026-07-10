'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { CLASS_BANDS } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SlotRow {
    label: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
}

interface CreateFullResult {
    exam: { id: string; title: string };
    instance: { id: string };
    slots: { id: string }[];
}

interface DistributeSummary {
    allocated: number;
    overflowed: number;
    noCapacity: number;
    skippedAlreadyBooked: number;
}

const STEPS = ['Exam details', 'Schedule', 'Slots', 'Review'] as const;

function apiError(err: unknown, fallback: string): string {
    const data =
        typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data
            : undefined;
    const message = data?.message;
    if (Array.isArray(message)) return message.join(', ');
    return message || fallback;
}

/**
 * The exam-creation wizard: define the exam, its schedule, and its slots, then
 * auto-assign every eligible student across those slots — same school together,
 * balanced, overflowing when a slot fills.
 */
export default function NewExamWizard() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Step 1 — exam
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [classBands, setClassBands] = useState<number[]>([]);
    const [totalMarks, setTotalMarks] = useState(100);
    const [durationMinutes, setDurationMinutes] = useState(60);
    const [feeAmount, setFeeAmount] = useState(0);
    const [isPublished, setIsPublished] = useState(true);

    // Step 2 — instance
    const [instanceStart, setInstanceStart] = useState('');
    const [instanceEnd, setInstanceEnd] = useState('');
    const [requireSeb, setRequireSeb] = useState(false);

    // Step 3 — slots
    const [slots, setSlots] = useState<SlotRow[]>([
        { label: 'Slot 1', startsAt: '', endsAt: '', capacity: 100 },
    ]);

    // Result
    const [created, setCreated] = useState<CreateFullResult | null>(null);
    const [summary, setSummary] = useState<DistributeSummary | null>(null);

    const toggleBand = (band: number) =>
        setClassBands((prev) =>
            prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band].sort((a, b) => a - b),
        );

    const addSlot = () =>
        setSlots((prev) => [
            ...prev,
            { label: `Slot ${prev.length + 1}`, startsAt: instanceStart, endsAt: instanceEnd, capacity: 100 },
        ]);

    const updateSlot = (i: number, patch: Partial<SlotRow>) =>
        setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

    const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));

    function validateStep(): string | null {
        if (step === 0) {
            if (!title.trim()) return 'Enter an exam title.';
            if (classBands.length === 0) return 'Select at least one class.';
        }
        if (step === 1) {
            if (!instanceStart || !instanceEnd) return 'Set the exam window start and end.';
            if (new Date(instanceEnd) <= new Date(instanceStart)) return 'End must be after start.';
        }
        if (step === 2) {
            if (slots.length === 0) return 'Add at least one slot.';
            for (const s of slots) {
                if (!s.startsAt || !s.endsAt) return 'Every slot needs a start and end time.';
                if (s.capacity < 1) return 'Slot capacity must be at least 1.';
            }
        }
        return null;
    }

    function next() {
        const problem = validateStep();
        if (problem) {
            setError(problem);
            return;
        }
        setError('');
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }

    async function submit() {
        setBusy(true);
        setError('');
        try {
            const { data } = await api.post<CreateFullResult>('/admin/exams/full', {
                title,
                description: description || undefined,
                classBands,
                totalMarks,
                durationMinutes,
                feeAmount,
                isPublished,
                instance: { startsAt: instanceStart, endsAt: instanceEnd, requireSeb },
                slots: slots.map((s) => ({
                    label: s.label || undefined,
                    startsAt: s.startsAt,
                    endsAt: s.endsAt,
                    capacity: Number(s.capacity),
                })),
            });
            setCreated(data);
        } catch (err) {
            setError(apiError(err, 'Could not create the exam.'));
        } finally {
            setBusy(false);
        }
    }

    async function autoDistribute() {
        if (!created) return;
        setBusy(true);
        setError('');
        try {
            const { data } = await api.post<DistributeSummary>(
                `/admin/exams/instances/${created.instance.id}/auto-distribute`,
            );
            setSummary(data);
        } catch (err) {
            setError(apiError(err, 'Could not auto-assign students.'));
        } finally {
            setBusy(false);
        }
    }

    // ── Success view ──────────────────────────────────────────────────────────
    if (created) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <main className="container page-content">
                    <div className="page-header">
                        <h1>Exam created</h1>
                    </div>
                    <div className="glass-card" style={{ padding: 'var(--space-6)', maxWidth: 640 }}>
                        <h3>{created.exam.title}</h3>
                        <p className="text-muted">
                            {created.slots.length} slot{created.slots.length === 1 ? '' : 's'} created. You can
                            now auto-assign every eligible student across them — same school together,
                            balanced, overflowing when a slot fills.
                        </p>

                        {error && <div className="form-error">{error}</div>}

                        {summary ? (
                            <div className="glass-card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                                <h4>Assignment complete</h4>
                                <div className="stat-row" style={{ marginTop: 'var(--space-3)' }}>
                                    <Stat label="Allocated" value={summary.allocated} />
                                    <Stat label="Overflowed" value={summary.overflowed} />
                                    <Stat label="No capacity" value={summary.noCapacity} />
                                    <Stat label="Already booked" value={summary.skippedAlreadyBooked} />
                                </div>
                                {summary.noCapacity > 0 && (
                                    <p className="text-muted" style={{ marginTop: 'var(--space-3)' }}>
                                        {summary.noCapacity} eligible student{summary.noCapacity === 1 ? '' : 's'}{' '}
                                        could not be placed — add slots or capacity, then re-run from Slots &amp;
                                        windows.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <button className="btn btn-primary" onClick={autoDistribute} disabled={busy} style={{ marginTop: 'var(--space-4)' }}>
                                {busy ? 'Assigning…' : 'Auto-assign eligible students now'}
                            </button>
                        )}

                        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                            <button className="btn btn-secondary" onClick={() => router.push('/slots')}>
                                Go to Slots &amp; windows
                            </button>
                            <button className="btn btn-secondary" onClick={() => router.push(`/questions?examId=${created.exam.id}`)}>
                                Add questions
                            </button>
                        </div>
                    </div>
                </main>
            </AuthGuard>
        );
    }

    // ── Wizard ────────────────────────────────────────────────────────────────
    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container page-content">
                <div className="page-header">
                    <div>
                        <h1>New exam</h1>
                        <p className="text-muted">
                            Step {step + 1} of {STEPS.length} — {STEPS[step]}
                        </p>
                    </div>
                </div>

                <div className="class-pills" style={{ marginBottom: 'var(--space-6)' }}>
                    {STEPS.map((s, i) => (
                        <span key={s} className={`class-pill ${i === step ? 'active' : ''}`} style={{ cursor: 'default' }}>
                            {i + 1}. {s}
                        </span>
                    ))}
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card" style={{ padding: 'var(--space-6)', maxWidth: 760 }}>
                    {step === 0 && (
                        <div className="exam-form">
                            <div className="form-group">
                                <label>Exam title *</label>
                                <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Regional Science Olympiad 2026" />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                            </div>
                            <div className="grid-3" style={{ gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label>Duration (min) *</label>
                                    <input type="number" className="form-control" min={10} max={300} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                                </div>
                                <div className="form-group">
                                    <label>Total marks *</label>
                                    <input type="number" className="form-control" min={1} value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} />
                                </div>
                                <div className="form-group">
                                    <label>Fee (₹, 0 = free)</label>
                                    <input type="number" className="form-control" min={0} value={feeAmount} onChange={(e) => setFeeAmount(Number(e.target.value))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Target classes *</label>
                                <div className="class-pills">
                                    {CLASS_BANDS.map((band) => (
                                        <button key={band} type="button" className={`class-pill ${classBands.includes(band) ? 'active' : ''}`} onClick={() => toggleBand(band)}>
                                            Class {band}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                                    Publish immediately (students can see it)
                                </label>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="exam-form">
                            <p className="text-muted">The overall window this exam runs in. Slots sit inside it.</p>
                            <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label>Window starts *</label>
                                    <input type="datetime-local" className="form-control" value={instanceStart} onChange={(e) => setInstanceStart(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Window ends *</label>
                                    <input type="datetime-local" className="form-control" value={instanceEnd} onChange={(e) => setInstanceEnd(e.target.value)} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input type="checkbox" checked={requireSeb} onChange={(e) => setRequireSeb(e.target.checked)} />
                                    Require Safe Exam Browser
                                </label>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="exam-form">
                            <p className="text-muted">
                                Add the exam-day batches. Students are auto-assigned across these, keeping each
                                school together and balancing the load.
                            </p>
                            {slots.map((slot, i) => (
                                <div key={i} className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                                    <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
                                        <div className="form-group">
                                            <label>Label</label>
                                            <input className="form-control" value={slot.label} onChange={(e) => updateSlot(i, { label: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Capacity</label>
                                            <input type="number" min={1} className="form-control" value={slot.capacity} onChange={(e) => updateSlot(i, { capacity: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                    <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
                                        <div className="form-group">
                                            <label>Starts</label>
                                            <input type="datetime-local" className="form-control" value={slot.startsAt} onChange={(e) => updateSlot(i, { startsAt: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Ends</label>
                                            <input type="datetime-local" className="form-control" value={slot.endsAt} onChange={(e) => updateSlot(i, { endsAt: e.target.value })} />
                                        </div>
                                    </div>
                                    {slots.length > 1 && (
                                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSlot(i)}>
                                            Remove slot
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button type="button" className="btn btn-secondary btn-sm" onClick={addSlot}>
                                + Add slot
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="exam-form">
                            <h3>{title}</h3>
                            <p className="text-muted">
                                Classes {classBands.join(', ')} · {durationMinutes} min · {totalMarks} marks ·{' '}
                                {feeAmount === 0 ? 'Free' : `₹${feeAmount}`}
                            </p>
                            <p className="text-muted">
                                Window: {instanceStart ? new Date(instanceStart).toLocaleString('en-IN') : '—'} →{' '}
                                {instanceEnd ? new Date(instanceEnd).toLocaleString('en-IN') : '—'}
                            </p>
                            <table className="data-table" style={{ marginTop: 'var(--space-3)' }}>
                                <thead>
                                    <tr><th>Slot</th><th>Window</th><th>Capacity</th></tr>
                                </thead>
                                <tbody>
                                    {slots.map((s, i) => (
                                        <tr key={i}>
                                            <td>{s.label}</td>
                                            <td className="text-muted">
                                                {s.startsAt ? new Date(s.startsAt).toLocaleString('en-IN') : '—'} →{' '}
                                                {s.endsAt ? new Date(s.endsAt).toLocaleTimeString('en-IN') : '—'}
                                            </td>
                                            <td>{s.capacity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="text-muted" style={{ marginTop: 'var(--space-3)' }}>
                                Total capacity: {slots.reduce((sum, s) => sum + Number(s.capacity), 0)} seats.
                            </p>
                        </div>
                    )}

                    <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
                        <button className="btn btn-secondary" onClick={() => (step === 0 ? router.push('/exams') : setStep((s) => s - 1))} disabled={busy}>
                            {step === 0 ? 'Cancel' : 'Back'}
                        </button>
                        {step < STEPS.length - 1 ? (
                            <button className="btn btn-primary" onClick={next}>Next</button>
                        ) : (
                            <button className="btn btn-primary" onClick={submit} disabled={busy}>
                                {busy ? 'Creating…' : 'Create exam'}
                            </button>
                        )}
                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="stat-tile">
            <span className="stat-tile__label">{label}</span>
            <span className="stat-tile__value">{value}</span>
        </div>
    );
}
