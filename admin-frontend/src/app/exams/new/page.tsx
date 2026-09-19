'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { CLASS_BANDS } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

/**
 * One sitting under a date — a time and how many participants it seats.
 * `id` is a client-only key, never sent to the server.
 */
interface DateTimingDraft {
    id: string;
    startTime: string;
    endTime: string;
    seats: number;
    label: string;
}

/**
 * One date this exam runs on, and the sittings that run on it — the shape an
 * admin actually thinks in: pick a date, give it a priority, add the timings
 * and seat counts underneath it. `id` is a client-only key.
 */
interface DateCard {
    id: string;
    date: string;
    priority: number;
    note: string;
    timings: DateTimingDraft[];
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
    /** Sittings already open and visible on the scheduling page — not a promise, a count. */
    sittingsOpened: number;
}

const STEPS = ['Exam details', 'Schedule', 'Sittings', 'Review'] as const;

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WEEKDAYS = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
];

/** `HH:mm` plus minutes, wrapped at midnight. */
function addMinutes(hhmm: string, minutes: number) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + minutes) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function newId() {
    return Math.random().toString(36).slice(2);
}

function fmtDate(date: string) {
    return new Date(`${date}T00:00:00+05:30`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        timeZone: 'Asia/Kolkata',
    });
}

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
 * The exam-creation wizard: the exam, the window it runs in, and the sittings
 * inside it.
 *
 * A custom exam is built date-first: add a date, give it a priority (lower
 * fills before higher), then add the timings and seat counts that run under
 * that date. Once one sitting fills, the next registration lands on the next
 * one — by priority, then by date, then by clock order within a date — with
 * no further setup. The published-season shortcut skips all of this for an
 * exam that runs on the standard calendar instead.
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
    const [dateCards, setDateCards] = useState<DateCard[]>([]);
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

    /** The same arithmetic for a custom calendar: every timing under every date. */
    const customTotals = useMemo(() => {
        let sittings = 0;
        let places = 0;
        for (const d of dateCards) {
            for (const t of d.timings) {
                sittings += 1;
                places += Number(t.seats) || 0;
            }
        }
        return { sittings, places };
    }, [dateCards]);

    const toggleBand = (band: number) =>
        setClassBands((prev) =>
            prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band].sort((a, b) => a - b),
        );

    // ── Date cards ────────────────────────────────────────────────────────────

    const addDateCard = () =>
        setDateCards((prev) => [
            ...prev,
            {
                id: newId(),
                date: '',
                // Consecutive dates are usually the same tier — defaulting to
                // the last one added means only the overflow dates need the
                // priority actually changed.
                priority: prev[prev.length - 1]?.priority ?? 1,
                note: '',
                timings: [],
            },
        ]);

    const removeDateCard = (id: string) =>
        setDateCards((prev) => prev.filter((d) => d.id !== id));

    const updateDateCard = (id: string, patch: Partial<Omit<DateCard, 'id' | 'timings'>>) =>
        setDateCards((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

    const addTimingToDate = (dateId: string) =>
        setDateCards((prev) =>
            prev.map((d) => {
                if (d.id !== dateId) return d;
                const start = options?.times[0]?.value ?? '11:00';
                return {
                    ...d,
                    timings: [
                        ...d.timings,
                        {
                            id: newId(),
                            startTime: start,
                            endTime: addMinutes(start, options?.defaultDurationMinutes ?? 60),
                            seats: options?.defaultCapacity ?? 50,
                            label: '',
                        },
                    ],
                };
            }),
        );

    const updateTimingInDate = (dateId: string, timingId: string, patch: Partial<DateTimingDraft>) =>
        setDateCards((prev) =>
            prev.map((d) =>
                d.id !== dateId
                    ? d
                    : { ...d, timings: d.timings.map((t) => (t.id === timingId ? { ...t, ...patch } : t)) },
            ),
        );

    const removeTimingFromDate = (dateId: string, timingId: string) =>
        setDateCards((prev) =>
            prev.map((d) =>
                d.id !== dateId ? d : { ...d, timings: d.timings.filter((t) => t.id !== timingId) },
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

            if (dateCards.length === 0) return 'Add at least one exam date.';
            const dateValues = new Set<string>();
            for (const d of dateCards) {
                if (!d.date) return 'Every date needs an actual date picked.';
                if (dateValues.has(d.date)) return `${fmtDate(d.date)} is added twice.`;
                dateValues.add(d.date);
                if (!d.priority || d.priority < 1) return `${fmtDate(d.date)} needs a priority of 1 or higher.`;
                if (d.timings.length === 0) {
                    return `${fmtDate(d.date)} has no sittings yet — add at least one time and seat count.`;
                }
                for (const t of d.timings) {
                    if (!t.startTime || !t.endTime) return `${fmtDate(d.date)}: every sitting needs a start and end time.`;
                    if (t.startTime === t.endTime) return `${fmtDate(d.date)}: a sitting must be longer than zero minutes.`;
                    if (!t.seats || t.seats < 1) return `${fmtDate(d.date)}: every sitting needs at least one seat.`;
                }
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
                          customSchedule: dateCards.map((d) => ({
                              date: d.date,
                              priority: d.priority,
                              note: d.note || undefined,
                              timings: d.timings.map((t) => ({
                                  startTime: t.startTime,
                                  endTime: t.endTime,
                                  seats: Number(t.seats),
                                  label: t.label || undefined,
                              })),
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
                            sign up, rolling forward as dates fill.
                        </p>
                        <p
                            style={{
                                marginTop: 'var(--space-3)',
                                padding: 'var(--space-3) var(--space-4)',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(255,203,5,0.12)',
                                border: '1px solid var(--primary-400)',
                                fontWeight: 600,
                            }}
                        >
                            {created.sittingsOpened} sitting{created.sittingsOpened === 1 ? '' : 's'}{' '}
                            {created.sittingsOpened === 1 ? 'is' : 'are'} already open — see them now
                            on the scheduling page, no need to wait for a registration.
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
                                            ['custom', 'Custom dates', 'Pick your own dates. Add sittings and seat counts directly under each one.'],
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
                                    <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
                                        Add a date, give it a priority — <strong>lower numbers fill
                                        first</strong> — then add the sittings that run on it. Once one
                                        sitting is full, the next registration lands on the next one:
                                        the next sitting on that date, then the next date at the same
                                        priority, then the next priority up.
                                    </p>

                                    {dateCards.map((card) => (
                                        <DateScheduleCard
                                            key={card.id}
                                            card={card}
                                            minDate={instanceStart ? instanceStart.slice(0, 10) : undefined}
                                            maxDate={instanceEnd ? instanceEnd.slice(0, 10) : undefined}
                                            calendarOptions={options}
                                            onUpdate={(patch) => updateDateCard(card.id, patch)}
                                            onRemove={() => removeDateCard(card.id)}
                                            onAddTiming={() => addTimingToDate(card.id)}
                                            onUpdateTiming={(timingId, patch) =>
                                                updateTimingInDate(card.id, timingId, patch)
                                            }
                                            onRemoveTiming={(timingId) =>
                                                removeTimingFromDate(card.id, timingId)
                                            }
                                        />
                                    ))}

                                    <button type="button" className="btn btn-secondary btn-sm" onClick={addDateCard}>
                                        + Add date
                                    </button>

                                    {dateCards.length > 0 && (
                                        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 'var(--space-3)' }}>
                                            {customTotals.sittings} sitting{customTotals.sittings === 1 ? '' : 's'} ·{' '}
                                            {customTotals.places.toLocaleString('en-IN')} seats total across{' '}
                                            {dateCards.length} date{dateCards.length === 1 ? '' : 's'}.
                                        </p>
                                    )}
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
                                        {mode === 'standard' ? (
                                            <>
                                                Every {WEEKDAY_FULL[dayPreference[0]]} between {leadDays} and{' '}
                                                {horizonDays} days out is tried in turn
                                                {dayPreference.length > 1
                                                    ? `, and only when all of them are full are ${dayPreference.slice(1).map((d) => `${WEEKDAY_FULL[d]}s`).join(', then ')} tried.`
                                                    : '.'}
                                            </>
                                        ) : (
                                            <>
                                                This only matters as a fallback if every date above is
                                                later removed — while any of them exist, your dates and
                                                priorities decide the order, not this.
                                            </>
                                        )}
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
                                    <table className="data-table" style={{ marginTop: 'var(--space-3)' }}>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Priority</th>
                                                <th>Sittings</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dateCards.map((d) => (
                                                <tr key={d.id}>
                                                    <td>{fmtDate(d.date)}</td>
                                                    <td className="text-muted">{d.priority}</td>
                                                    <td>
                                                        {d.timings.map((t) => (
                                                            <div key={t.id}>
                                                                {t.startTime}–{t.endTime}: {t.seats} seat
                                                                {t.seats === 1 ? '' : 's'}
                                                                {t.label && <span className="text-muted"> ({t.label})</span>}
                                                            </div>
                                                        ))}
                                                    </td>
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

/** One date card in the custom-schedule builder: its own priority and its own nested sittings. */
function DateScheduleCard({
    card,
    minDate,
    maxDate,
    calendarOptions,
    onUpdate,
    onRemove,
    onAddTiming,
    onUpdateTiming,
    onRemoveTiming,
}: {
    card: DateCard;
    minDate?: string;
    maxDate?: string;
    calendarOptions: CalendarOptions | null;
    onUpdate: (patch: Partial<Omit<DateCard, 'id' | 'timings'>>) => void;
    onRemove: () => void;
    onAddTiming: () => void;
    onUpdateTiming: (timingId: string, patch: Partial<DateTimingDraft>) => void;
    onRemoveTiming: (timingId: string) => void;
}) {
    const totalSeats = card.timings.reduce((n, t) => n + (Number(t.seats) || 0), 0);

    return (
        <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: '1 1 170px', marginBottom: 0 }}>
                    <label>Date (IST)</label>
                    <input
                        type="date"
                        className="form-control"
                        value={card.date}
                        min={minDate}
                        max={maxDate}
                        onChange={(e) => onUpdate({ date: e.target.value })}
                    />
                </div>
                <div className="form-group" style={{ flex: '0 1 150px', marginBottom: 0 }}>
                    <label>Priority</label>
                    <input
                        type="number"
                        min={1}
                        max={9}
                        className="form-control"
                        value={card.priority}
                        onChange={(e) => onUpdate({ priority: Number(e.target.value) })}
                    />
                </div>
                <div className="form-group" style={{ flex: '2 1 200px', marginBottom: 0 }}>
                    <label>Note (optional)</label>
                    <input
                        className="form-control"
                        value={card.note}
                        placeholder="e.g. overflow day"
                        onChange={(e) => onUpdate({ note: e.target.value })}
                    />
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
                    Remove date
                </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 'var(--space-2)' }}>
                Priority {card.priority}{card.priority === 1 ? ' — filled first' : ''} — filled before any
                higher-numbered priority is used.
            </p>

            <div style={{ marginTop: 'var(--space-4)' }}>
                {card.timings.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        No sittings yet — add at least one time and seat count.
                    </p>
                ) : (
                    card.timings.map((t) => (
                        <div
                            key={t.id}
                            style={{
                                display: 'flex',
                                gap: 'var(--space-3)',
                                flexWrap: 'wrap',
                                alignItems: 'flex-end',
                                background: 'var(--bg-elevated)',
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--space-2)',
                            }}
                        >
                            <div className="form-group" style={{ flex: '1 1 130px', marginBottom: 0 }}>
                                <label>Starts</label>
                                {calendarOptions ? (
                                    <select
                                        className="form-control"
                                        value={t.startTime}
                                        onChange={(e) =>
                                            onUpdateTiming(t.id, {
                                                startTime: e.target.value,
                                                endTime: addMinutes(
                                                    e.target.value,
                                                    calendarOptions.defaultDurationMinutes,
                                                ),
                                            })
                                        }
                                    >
                                        {calendarOptions.times.map((ct) => (
                                            <option key={ct.value} value={ct.value}>
                                                {ct.label}
                                            </option>
                                        ))}
                                        {!calendarOptions.times.some((ct) => ct.value === t.startTime) && (
                                            <option value={t.startTime}>{t.startTime}</option>
                                        )}
                                    </select>
                                ) : (
                                    <input
                                        type="time"
                                        className="form-control"
                                        value={t.startTime}
                                        onChange={(e) => onUpdateTiming(t.id, { startTime: e.target.value })}
                                    />
                                )}
                            </div>
                            <div className="form-group" style={{ flex: '1 1 130px', marginBottom: 0 }}>
                                <label>Ends</label>
                                <input
                                    type="time"
                                    className="form-control"
                                    value={t.endTime}
                                    onChange={(e) => onUpdateTiming(t.id, { endTime: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ flex: '1 1 110px', marginBottom: 0 }}>
                                <label>Seats</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="form-control"
                                    value={t.seats}
                                    onChange={(e) => onUpdateTiming(t.id, { seats: Number(e.target.value) })}
                                />
                            </div>
                            <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                                <label>Label (optional)</label>
                                <input
                                    className="form-control"
                                    value={t.label}
                                    placeholder="Morning sitting"
                                    onChange={(e) => onUpdateTiming(t.id, { label: e.target.value })}
                                />
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => onRemoveTiming(t.id)}
                                aria-label="Remove this sitting"
                            >
                                ×
                            </button>
                        </div>
                    ))
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onAddTiming}>
                        + Add sitting
                    </button>
                    {card.timings.length > 0 && (
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {card.timings.length} sitting{card.timings.length === 1 ? '' : 's'} ·{' '}
                            {totalSeats} seat{totalSeats === 1 ? '' : 's'} on this date
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
