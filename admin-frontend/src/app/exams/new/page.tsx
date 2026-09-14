'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { CLASS_BANDS } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

/** One recurring sitting time — the shape `SlotTiming` stores. */
interface TimingRow {
    label: string;
    startTime: string;
    endTime: string;
    capacity: number;
    weekdays: number[];
    /** Calendar tier: 1 is filled before 2. */
    priority: number;
}

/** One date this exam runs on. */
interface DateRow {
    /** `YYYY-MM-DD`, IST. */
    date: string;
    priority: number;
    note: string;
}

/** The sitting times the season publishes, served so the two never drift. */
interface CalendarOptions {
    times: { value: string; label: string; priorities: number[] }[];
    defaultDurationMinutes: number;
    defaultCapacity: number;
}

/**
 * How this exam's sittings are laid out.
 *
 * `standard` is the published season — eight Priority 1 Sundays running seven
 * sittings, eight Priority 2 Saturdays running two, and the Diwali blackout. It
 * is a single flag rather than seventy-two rows in the wizard, and the server
 * seeds it so the wizard and the scheduling page cannot disagree about what the
 * season is.
 *
 * `custom` is for an exam that runs on its own dates.
 */
type SittingMode = 'standard' | 'custom';

interface CreateFullResult {
    exam: { id: string; title: string };
    instance: { id: string };
    slotTimings: { id: string }[];
}

const STEPS = ['Exam details', 'Schedule', 'Sittings', 'Review'] as const;

const WEEKDAYS = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
];

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `HH:mm` plus minutes, wrapped at midnight. */
function addMinutes(hhmm: string, minutes: number) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + minutes) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const priorityName = (p: number) =>
    p === 1 ? 'Priority 1 — filled first' : p === 2 ? 'Priority 2 — overflow' : `Priority ${p}`;

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
 * The exam-creation wizard: the exam, the window it runs in, and the recurring
 * sittings inside it.
 *
 * Step 3 collects *timings*, not dates. Which Sundays actually need to exist
 * depends on when each participant registers, so the dated sittings are created
 * by the assigner as it needs them — there is nothing to enumerate here, and
 * nothing to auto-distribute afterwards.
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

    // Step 3 — the sittings and the assignment rules
    const [mode, setMode] = useState<SittingMode>('standard');
    const [options, setOptions] = useState<CalendarOptions | null>(null);
    const [standardCapacity, setStandardCapacity] = useState(50);
    const [dates, setDates] = useState<DateRow[]>([]);
    const [newDate, setNewDate] = useState('');
    const [newDatePriority, setNewDatePriority] = useState(1);
    const [timings, setTimings] = useState<TimingRow[]>([
        {
            label: 'Morning sitting',
            startTime: '10:00',
            endTime: '12:00',
            capacity: 50,
            weekdays: [0, 6],
            priority: 1,
        },
    ]);
    const [leadDays, setLeadDays] = useState(14);
    const [horizonDays, setHorizonDays] = useState(56);
    const [dayPreference, setDayPreference] = useState<number[]>([0, 6]);

    // Result
    const [created, setCreated] = useState<CreateFullResult | null>(null);

    useEffect(() => {
        api.get<CalendarOptions>('/admin/slot-calendar/options')
            .then(({ data }) => {
                setOptions(data);
                setStandardCapacity(data.defaultCapacity);
            })
            .catch(() => setOptions(null));
    }, []);

    const addDate = () => {
        if (!newDate) return;
        setDates((prev) =>
            prev.some((d) => d.date === newDate)
                ? prev
                : [...prev, { date: newDate, priority: newDatePriority, note: '' }].sort((a, b) =>
                      a.priority - b.priority || a.date.localeCompare(b.date),
                  ),
        );
        setNewDate('');
    };

    const removeDate = (date: string) => setDates((prev) => prev.filter((d) => d.date !== date));

    /**
     * What the published season adds up to, read off the served time list rather
     * than hard-coded — a review screen that disagreed with what the server
     * creates would be worse than no review screen.
     */
    const standardTotals = useMemo(() => {
        const perTier = (priority: number) =>
            options?.times.filter((t) => t.priorities.includes(priority)).length ?? 0;
        // Eight dates in each tier; the Diwali rows are closed and seat nobody.
        const sittings = 8 * perTier(1) + 8 * perTier(2);
        return { sittings, places: sittings * standardCapacity };
    }, [options, standardCapacity]);

    /** The same arithmetic for a custom calendar: dates x their tier's times. */
    const customTotals = useMemo(() => {
        let sittings = 0;
        let places = 0;
        for (const d of dates) {
            for (const t of timings.filter((x) => x.priority === d.priority)) {
                sittings += 1;
                places += Number(t.capacity);
            }
        }
        return { sittings, places };
    }, [dates, timings]);

    /** The tiers that actually have a date, so a timing cannot be stranded. */
    const usedPriorities = useMemo(
        () => Array.from(new Set(dates.map((d) => d.priority))).sort((a, b) => a - b),
        [dates],
    );

    const toggleBand = (band: number) =>
        setClassBands((prev) =>
            prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band].sort((a, b) => a - b),
        );

    const addTiming = () =>
        setTimings((prev) => [
            ...prev,
            {
                label: '',
                startTime: options?.times[0]?.value ?? '14:00',
                endTime: addMinutes(
                    options?.times[0]?.value ?? '14:00',
                    options?.defaultDurationMinutes ?? 120,
                ),
                capacity: options?.defaultCapacity ?? 50,
                weekdays: [0, 6],
                priority: 1,
            },
        ]);

    const updateTiming = (i: number, patch: Partial<TimingRow>) =>
        setTimings((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

    const removeTiming = (i: number) => setTimings((prev) => prev.filter((_, idx) => idx !== i));

    const toggleTimingDay = (i: number, day: number) =>
        setTimings((prev) =>
            prev.map((t, idx) =>
                idx === i
                    ? {
                          ...t,
                          weekdays: t.weekdays.includes(day)
                              ? t.weekdays.filter((d) => d !== day)
                              : [...t.weekdays, day].sort((a, b) => a - b),
                      }
                    : t,
            ),
        );

    const togglePreferredDay = (day: number) =>
        setDayPreference((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
        );

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
            if (horizonDays < leadDays) return 'The latest sitting must be further out than the earliest.';

            // The published season's dates and times are fixed; only its seat
            // count is set here, and it needs the same floor as a custom one.
            if (mode === 'standard') {
                if (standardCapacity < 1) return 'Each sitting needs at least one seat.';
                return null;
            }

            if (dates.length === 0) return 'Add at least one exam date.';
            if (timings.length === 0) return 'Add at least one sitting time.';
            for (const t of timings) {
                if (!t.startTime || !t.endTime) return 'Every sitting needs a start and end time.';
                if (t.startTime === t.endTime) return 'A sitting must be longer than zero minutes.';
                if (t.capacity < 1) return 'Each sitting needs at least one seat.';
            }
            // A date whose tier runs no sitting, or a sitting whose tier has no
            // date, is the single most common way to end up with an exam nobody
            // can be scheduled for — so both are caught here rather than
            // discovered later on the unassigned list.
            const timedTiers = new Set(timings.map((t) => t.priority));
            const orphanDate = usedPriorities.find((p) => !timedTiers.has(p));
            if (orphanDate !== undefined) {
                return `No sitting time is set for Priority ${orphanDate}, but dates use it. Add a time for that priority, or move those dates.`;
            }
            const orphanTiming = timings.find((t) => !usedPriorities.includes(t.priority));
            if (orphanTiming) {
                return `The ${orphanTiming.startTime} sitting is Priority ${orphanTiming.priority}, but no date uses that priority. Add a date for it, or change the sitting's priority.`;
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
                instance: {
                    startsAt: instanceStart,
                    endsAt: instanceEnd,
                    requireSeb,
                    slotLeadDays: leadDays,
                    slotHorizonDays: horizonDays,
                    slotDayPreference: dayPreference,
                },
                ...(mode === 'standard'
                    ? { useStandardCalendar: true, standardCalendarCapacity: standardCapacity }
                    : {
                          scheduleDates: dates.map((d) => ({
                              date: d.date,
                              priority: d.priority,
                              note: d.note || undefined,
                          })),
                          slotTimings: timings.map((t) => ({
                              label: t.label || undefined,
                              startTime: t.startTime,
                              endTime: t.endTime,
                              capacity: Number(t.capacity),
                              weekdays: t.weekdays,
                              priority: t.priority,
                          })),
                      }),
            });
            setCreated(data);
        } catch (err) {
            setError(apiError(err, 'Could not create the exam.'));
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
                            {created.slotTimings.length} sitting time
                            {created.slotTimings.length === 1 ? '' : 's'} configured. Participants
                            are now scheduled automatically as they register — the first{' '}
                            {WEEKDAY_FULL[dayPreference[0]]} at least {leadDays} days after they
                            sign up, rolling forward as dates fill. Dated sittings appear on the
                            scheduling page as they are needed.
                        </p>

                        {error && <div className="form-error">{error}</div>}

                        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" onClick={() => router.push('/slots')}>
                                Go to Exam scheduling
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
                            <p className="text-muted">The overall window this exam runs in. Sittings sit inside it.</p>
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
                            <div className="form-group">
                                <label>How this exam is scheduled</label>
                                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                    {(
                                        [
                                            ['standard', 'Published season', 'The eight Priority 1 Sundays and eight Priority 2 Saturdays, their sitting times, and the Diwali blackout.'],
                                            ['custom', 'Custom dates', 'Choose the dates and times yourself.'],
                                        ] as const
                                    ).map(([value, label, hint]) => {
                                        const on = mode === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() => setMode(value)}
                                                style={{
                                                    flex: '1 1 260px',
                                                    textAlign: 'left',
                                                    padding: 'var(--space-4)',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: on
                                                        ? '1px solid var(--primary-400)'
                                                        : '1px solid var(--border-default)',
                                                    background: on
                                                        ? 'rgba(255,203,5,0.14)'
                                                        : 'var(--bg-input)',
                                                    color: 'inherit',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <strong style={{ fontSize: '0.95rem' }}>{label}</strong>
                                                <div
                                                    className="text-muted"
                                                    style={{ fontSize: '0.8rem', marginTop: 4 }}
                                                >
                                                    {hint}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {mode === 'standard' ? (
                                <div
                                    className="glass-card"
                                    style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}
                                >
                                    <p style={{ fontSize: '0.9rem' }}>
                                        The published season will be created for this exam: eight
                                        Priority 1 Sundays running{' '}
                                        {options?.times.filter((t) => t.priorities.includes(1)).length ?? 7}{' '}
                                        sittings each, eight Priority 2 Saturdays running{' '}
                                        {options?.times.filter((t) => t.priorities.includes(2)).length ?? 2}{' '}
                                        each — and 7–9 November closed for Diwali.
                                    </p>
                                    <div
                                        className="form-group"
                                        style={{ maxWidth: 220, marginTop: 'var(--space-3)' }}
                                    >
                                        <label>Seats per sitting</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            min={1}
                                            value={standardCapacity}
                                            onChange={(e) =>
                                                setStandardCapacity(Number(e.target.value))
                                            }
                                        />
                                        <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                                            {standardTotals.sittings} sittings × {standardCapacity} seats ={' '}
                                            {standardTotals.places.toLocaleString()} places.
                                        </p>
                                    </div>
                                    <p
                                        className="text-muted"
                                        style={{ fontSize: '0.8rem', marginTop: 'var(--space-2)' }}
                                    >
                                        Participants are placed on the earliest Priority 1 date with a
                                        free seat, and only spill onto a Priority 2 Saturday once every
                                        Sunday is full. Every date, time and seat count can be edited
                                        afterwards on the scheduling page.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="glass-card"
                                        style={{
                                            padding: 'var(--space-4)',
                                            marginBottom: 'var(--space-4)',
                                        }}
                                    >
                                        <label>Exam dates</label>
                                        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                                            Filled in priority order — every Priority 1 date is full
                                            before a Priority 2 one is used.
                                        </p>
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 'var(--space-3)',
                                                flexWrap: 'wrap',
                                                alignItems: 'flex-end',
                                                marginBottom: 'var(--space-3)',
                                            }}
                                        >
                                            <div
                                                className="form-group"
                                                style={{ flex: '1 1 170px', marginBottom: 0 }}
                                            >
                                                <label>Date (IST)</label>
                                                <input
                                                    type="date"
                                                    className="form-control"
                                                    value={newDate}
                                                    min={instanceStart ? instanceStart.slice(0, 10) : undefined}
                                                    max={instanceEnd ? instanceEnd.slice(0, 10) : undefined}
                                                    onChange={(e) => setNewDate(e.target.value)}
                                                />
                                            </div>
                                            <div
                                                className="form-group"
                                                style={{ flex: '1 1 200px', marginBottom: 0 }}
                                            >
                                                <label>Priority</label>
                                                <select
                                                    className="form-control"
                                                    value={newDatePriority}
                                                    onChange={(e) =>
                                                        setNewDatePriority(Number(e.target.value))
                                                    }
                                                >
                                                    <option value={1}>{priorityName(1)}</option>
                                                    <option value={2}>{priorityName(2)}</option>
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={addDate}
                                                disabled={!newDate}
                                            >
                                                + Add date
                                            </button>
                                        </div>

                                        {dates.length === 0 ? (
                                            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                                No dates yet.
                                            </p>
                                        ) : (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: 'var(--space-2)',
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                {dates.map((d) => (
                                                    <span
                                                        key={d.date}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 'var(--space-2)',
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            borderRadius: 'var(--radius-full)',
                                                            border: '1px solid var(--border-default)',
                                                            background: 'var(--bg-input)',
                                                            fontSize: '0.85rem',
                                                        }}
                                                    >
                                                        {new Date(`${d.date}T00:00:00+05:30`).toLocaleDateString(
                                                            'en-IN',
                                                            {
                                                                weekday: 'short',
                                                                day: '2-digit',
                                                                month: 'short',
                                                                timeZone: 'Asia/Kolkata',
                                                            },
                                                        )}
                                                        <span className="text-muted">P{d.priority}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeDate(d.date)}
                                                            aria-label={`Remove ${d.date}`}
                                                            style={{
                                                                background: 'none',
                                                                border: 0,
                                                                color: 'var(--text-secondary)',
                                                                cursor: 'pointer',
                                                                fontSize: '1rem',
                                                                lineHeight: 1,
                                                            }}
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-muted">
                                        The sitting times each date runs. A time belongs to one
                                        priority, so a Priority 2 date can run a shorter list than a
                                        Priority 1 one.
                                    </p>

                            {timings.map((timing, i) => (
                                <div key={i} className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                                    <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
                                        <div className="form-group">
                                            <label>Priority</label>
                                            <select
                                                className="form-control"
                                                value={timing.priority}
                                                onChange={(e) =>
                                                    updateTiming(i, { priority: Number(e.target.value) })
                                                }
                                            >
                                                <option value={1}>{priorityName(1)}</option>
                                                <option value={2}>{priorityName(2)}</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Starts (IST)</label>
                                            {options ? (
                                                <select
                                                    className="form-control"
                                                    value={timing.startTime}
                                                    onChange={(e) =>
                                                        updateTiming(i, {
                                                            startTime: e.target.value,
                                                            // The end follows the start by the gap the
                                                            // published schedule runs on; shortening a
                                                            // paper is still one edit away below.
                                                            endTime: addMinutes(
                                                                e.target.value,
                                                                options.defaultDurationMinutes,
                                                            ),
                                                        })
                                                    }
                                                >
                                                    {options.times
                                                        .filter((t) =>
                                                            t.priorities.includes(timing.priority),
                                                        )
                                                        .map((t) => (
                                                            <option key={t.value} value={t.value}>
                                                                {t.label}
                                                            </option>
                                                        ))}
                                                    {!options.times.some(
                                                        (t) => t.value === timing.startTime,
                                                    ) && (
                                                        <option value={timing.startTime}>
                                                            {timing.startTime} (not on the published list)
                                                        </option>
                                                    )}
                                                </select>
                                            ) : (
                                                <input type="time" className="form-control" value={timing.startTime} onChange={(e) => updateTiming(i, { startTime: e.target.value })} />
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
                                        <div className="form-group">
                                            <label>Ends (IST)</label>
                                            <input type="time" className="form-control" value={timing.endTime} onChange={(e) => updateTiming(i, { endTime: e.target.value })} />
                                        </div>
                                        <div />
                                    </div>
                                    <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
                                        <div className="form-group">
                                            <label>Seats per sitting</label>
                                            <input type="number" min={1} className="form-control" value={timing.capacity} onChange={(e) => updateTiming(i, { capacity: Number(e.target.value) })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Label (optional)</label>
                                            <input className="form-control" value={timing.label} placeholder="Morning sitting" onChange={(e) => updateTiming(i, { label: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Runs on (fallback only)</label>
                                        <p className="text-muted" style={{ fontSize: '0.78rem' }}>
                                            The priority above pairs this time with its dates. These
                                            weekdays only matter if every date is later removed.
                                        </p>
                                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                            {WEEKDAYS.map((d) => {
                                                const on = timing.weekdays.includes(d.value);
                                                return (
                                                    <button
                                                        key={d.value}
                                                        type="button"
                                                        aria-pressed={on}
                                                        onClick={() => toggleTimingDay(i, d.value)}
                                                        style={{
                                                            padding: 'var(--space-2) var(--space-4)',
                                                            borderRadius: 'var(--radius-full)',
                                                            border: on ? '1px solid var(--primary-400)' : '1px solid var(--border-default)',
                                                            background: on ? 'rgba(255,203,5,0.14)' : 'var(--bg-input)',
                                                            color: on ? 'var(--primary-400)' : 'var(--text-secondary)',
                                                            cursor: 'pointer',
                                                            fontSize: '0.875rem',
                                                        }}
                                                    >
                                                        {d.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {timings.length > 1 && (
                                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeTiming(i)}>
                                            Remove sitting
                                        </button>
                                    )}
                                </div>
                            ))}

                            <button type="button" className="btn btn-secondary btn-sm" onClick={addTiming}>
                                + Add sitting time
                            </button>
                                </>
                            )}

                            <hr style={{ margin: 'var(--space-6) 0', border: 0, borderTop: '1px solid var(--border-subtle)' }} />

                            <h4>How participants are scheduled</h4>
                            <p className="text-muted">
                                Each participant gets the first available date in this window,
                                counted from the day they registered.
                            </p>

                            <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
                                <div className="form-group">
                                    <label>Earliest sitting (days after registering)</label>
                                    <input type="number" min={0} max={365} className="form-control" value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} />
                                </div>
                                <div className="form-group">
                                    <label>Latest sitting (days after registering)</label>
                                    <input type="number" min={1} max={730} className="form-control" value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value))} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Preferred days, in order</label>
                                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                    {WEEKDAYS.map((d) => {
                                        const rank = dayPreference.indexOf(d.value);
                                        const on = rank >= 0;
                                        return (
                                            <button
                                                key={d.value}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() => togglePreferredDay(d.value)}
                                                style={{
                                                    padding: 'var(--space-2) var(--space-4)',
                                                    borderRadius: 'var(--radius-full)',
                                                    border: on ? '1px solid var(--primary-400)' : '1px solid var(--border-default)',
                                                    background: on ? 'rgba(255,203,5,0.14)' : 'var(--bg-input)',
                                                    color: on ? 'var(--primary-400)' : 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    fontSize: '0.875rem',
                                                    fontWeight: on ? 600 : 400,
                                                }}
                                            >
                                                {on && <span style={{ opacity: 0.7, marginRight: 4 }}>{rank + 1}.</span>}
                                                {d.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {dayPreference.length > 0 && (
                                    <p className="text-muted" style={{ marginTop: 'var(--space-3)', lineHeight: 1.6 }}>
                                        Every {WEEKDAY_FULL[dayPreference[0]]} between {leadDays} and{' '}
                                        {horizonDays} days out is tried in turn
                                        {dayPreference.length > 1
                                            ? `, and only when all of them are full are ${dayPreference.slice(1).map((d) => `${WEEKDAY_FULL[d]}s`).join(', then ')} tried.`
                                            : '.'}
                                    </p>
                                )}
                            </div>
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
                            {mode === 'standard' ? (
                                <>
                                    <p style={{ marginTop: 'var(--space-3)' }}>
                                        <strong>Published season.</strong> Eight Priority 1 Sundays and
                                        eight Priority 2 Saturdays will be created for this exam, with
                                        their sitting times and the Diwali blackout.
                                    </p>
                                    <p
                                        className="text-muted"
                                        style={{ marginTop: 'var(--space-2)', lineHeight: 1.6 }}
                                    >
                                        {standardTotals.sittings} sittings ·{' '}
                                        {standardTotals.places.toLocaleString('en-IN')} places. Priority 1
                                        is filled before any Priority 2 Saturday is used, and a
                                        participant is never given a sitting sooner than {leadDays} days
                                        away unless nothing later is free.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p
                                        className="text-muted"
                                        style={{ marginTop: 'var(--space-3)' }}
                                    >
                                        {dates.length} date{dates.length === 1 ? '' : 's'}:{' '}
                                        {dates
                                            .map(
                                                (d) =>
                                                    `${new Date(`${d.date}T00:00:00+05:30`).toLocaleDateString(
                                                        'en-IN',
                                                        { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' },
                                                    )} (P${d.priority})`,
                                            )
                                            .join(', ')}
                                    </p>
                                    <table className="data-table" style={{ marginTop: 'var(--space-3)' }}>
                                        <thead>
                                            <tr>
                                                <th>Sitting</th>
                                                <th>Priority</th>
                                                <th>Seats each</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {timings.map((t, i) => (
                                                <tr key={i}>
                                                    <td>
                                                        {t.startTime} – {t.endTime}
                                                        {t.label && <div className="text-muted">{t.label}</div>}
                                                    </td>
                                                    <td className="text-muted">{t.priority}</td>
                                                    <td>{t.capacity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p
                                        className="text-muted"
                                        style={{ marginTop: 'var(--space-3)', lineHeight: 1.6 }}
                                    >
                                        {customTotals.sittings} sittings ·{' '}
                                        {customTotals.places.toLocaleString('en-IN')} places across the
                                        dates above. Participants are placed in priority order, and never
                                        sooner than {leadDays} days away unless nothing later is free.
                                    </p>
                                </>
                            )}
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
