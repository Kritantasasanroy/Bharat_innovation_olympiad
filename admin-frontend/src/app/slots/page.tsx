'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Exam scheduling.
 *
 * Everything on this page hangs off one exam instance, because that is what the
 * auto-assigner reads. The three panels map onto the three questions an admin
 * actually has:
 *
 *  1. **Timings** — when do sittings run, and how many seats each? This is the
 *     recurring rule ("Sundays and Saturdays, 10:00–12:00, 50 seats"), not a
 *     list of dates. Dated sittings are created from it automatically.
 *  2. **Sittings** — which dates actually exist now, and how full is each? This
 *     is where seats get topped up for a busy weekend.
 *  3. **Participants** — who is scheduled when, who is not scheduled at all, and
 *     how do I move someone?
 *
 * There is no "assign a school to a slot" any more: dates follow each
 * participant's own registration date, so a school's students are spread across
 * whichever sittings their signup dates land them in.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface Exam {
    id: string;
    title: string;
    requiresSlot?: boolean;
    isTrial?: boolean;
}

interface ExamInstance {
    id: string;
    startsAt: string;
    endsAt: string;
}

interface SlotTiming {
    id: string;
    label: string | null;
    startMinute: number;
    endMinute: number;
    startTime: string;
    endTime: string;
    capacity: number;
    weekdays: number[];
    weekdayNames: string[];
    isActive: boolean;
    sortOrder: number;
}

interface Sitting {
    id: string;
    timingId: string | null;
    slotDate: string;
    label: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    booked: number;
    seatsLeft: number;
    isFull: boolean;
    weekday: string;
    timing?: { id: string; label: string | null; isActive: boolean } | null;
    examInstance?: { id: string; exam: { id: string; title: string } };
}

interface SittingStudent {
    id: string;
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        rollNumber: string | null;
        classBand: number | null;
        school: { id: string; name: string } | null;
    };
}

interface UnassignedStudent {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    rollNumber: string | null;
    classBand: number | null;
    createdAt: string;
    activatedAt: string | null;
    school: { id: string; name: string } | null;
}

interface AssignmentRules {
    id: string;
    startsAt: string;
    endsAt: string;
    slotLeadDays: number;
    slotHorizonDays: number;
    slotDayPreference: number[];
}

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

const IST = 'Asia/Kolkata';

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: IST,
    });
}

function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: IST,
    });
}

function errorOf(err: unknown, fallback: string) {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
        ?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? fallback);
}

function fillColor(booked: number, capacity: number) {
    const pct = capacity > 0 ? (booked / capacity) * 100 : 100;
    if (pct >= 100) return 'var(--danger-400, #ef4444)';
    if (pct >= 80) return 'var(--warning-400, #f59e0b)';
    return 'var(--success-400, #22c55e)';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminSlotsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [examId, setExamId] = useState('');
    const [instances, setInstances] = useState<ExamInstance[]>([]);
    const [instanceId, setInstanceId] = useState('');

    const [timings, setTimings] = useState<SlotTiming[]>([]);
    const [sittings, setSittings] = useState<Sitting[]>([]);
    const [rules, setRules] = useState<AssignmentRules | null>(null);
    const [unassigned, setUnassigned] = useState<UnassignedStudent[]>([]);

    const [loading, setLoading] = useState(false);
    const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

    // Roster drawer for one sitting.
    const [roster, setRoster] = useState<{ sitting: Sitting; students: SittingStudent[] } | null>(
        null,
    );
    const [rosterLoading, setRosterLoading] = useState(false);
    const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});
    const [movingId, setMovingId] = useState<string | null>(null);

    // ── Loaders ───────────────────────────────────────────────────────────────

    useEffect(() => {
        api.get<Exam[]>('/admin/exams')
            .then(({ data }) => setExams(data))
            .catch(() => setExams([]));
    }, []);

    useEffect(() => {
        if (!examId) {
            setInstances([]);
            setInstanceId('');
            return;
        }
        api.get<ExamInstance[]>(`/admin/exams/${examId}/instances`)
            .then(({ data }) => {
                setInstances(data);
                // One instance is the overwhelmingly common case — pick it, so the
                // admin does not have to make a choice that has only one answer.
                setInstanceId(data.length === 1 ? data[0].id : '');
            })
            .catch(() => setInstances([]));
    }, [examId]);

    const loadInstance = useCallback(async (id: string) => {
        setLoading(true);
        try {
            const [t, s, r, u] = await Promise.all([
                api.get<SlotTiming[]>(`/admin/exams/instances/${id}/slot-timings`),
                api.get<Sitting[]>(`/admin/slots?examInstanceId=${id}`),
                api.get<AssignmentRules>(`/admin/exams/instances/${id}/assignment-rules`),
                api.get<UnassignedStudent[]>(`/admin/exams/instances/${id}/unassigned`),
            ]);
            setTimings(t.data);
            setSittings(s.data);
            setRules(r.data);
            setUnassigned(u.data);
        } catch (err) {
            setBanner({ tone: 'err', text: errorOf(err, 'Could not load this exam’s schedule.') });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!instanceId) {
            setTimings([]);
            setSittings([]);
            setRules(null);
            setUnassigned([]);
            return;
        }
        loadInstance(instanceId);
    }, [instanceId, loadInstance]);

    const refresh = useCallback(() => {
        if (instanceId) loadInstance(instanceId);
    }, [instanceId, loadInstance]);

    const selectedExam = exams.find((e) => e.id === examId);
    const totals = useMemo(
        () => ({
            seats: sittings.reduce((n, s) => n + s.capacity, 0),
            booked: sittings.reduce((n, s) => n + s.booked, 0),
        }),
        [sittings],
    );

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main
                className="container animate-fade-in"
                style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}
            >
                <header style={{ marginBottom: 'var(--space-6)' }}>
                    <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Exam Scheduling</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                        Participants are scheduled automatically when they register — on the first
                        available sitting inside the window you set below. Set the timings and the
                        seat counts here; dated sittings are created as they are needed.
                    </p>
                </header>

                {banner && (
                    <div
                        className="glass-card"
                        style={{
                            padding: 'var(--space-4)',
                            marginBottom: 'var(--space-5)',
                            borderLeft: `3px solid ${banner.tone === 'ok' ? 'var(--success-400, #22c55e)' : 'var(--danger-400, #ef4444)'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 'var(--space-4)',
                        }}
                    >
                        <span style={{ fontSize: '0.9rem' }}>{banner.text}</span>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setBanner(null)}
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* ── Exam / instance picker ─────────────────────────────────── */}
                <div
                    className="glass-card"
                    style={{
                        padding: 'var(--space-5)',
                        marginBottom: 'var(--space-6)',
                        display: 'flex',
                        gap: 'var(--space-5)',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                    }}
                >
                    <div style={{ flex: '1 1 300px' }}>
                        <label className="input-label" htmlFor="exam-picker">
                            Exam
                        </label>
                        <select
                            id="exam-picker"
                            className="input-field"
                            value={examId}
                            onChange={(e) => setExamId(e.target.value)}
                        >
                            <option value="">Select an exam…</option>
                            {exams.map((ex) => (
                                <option key={ex.id} value={ex.id}>
                                    {ex.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: '1 1 300px' }}>
                        <label className="input-label" htmlFor="instance-picker">
                            Exam window
                        </label>
                        <select
                            id="instance-picker"
                            className="input-field"
                            value={instanceId}
                            onChange={(e) => setInstanceId(e.target.value)}
                            disabled={!examId || instances.length === 0}
                        >
                            <option value="">
                                {instances.length === 0 ? 'No windows scheduled' : 'Select a window…'}
                            </option>
                            {instances.map((i) => (
                                <option key={i.id} value={i.id}>
                                    {fmtDate(i.startsAt)} → {fmtDate(i.endsAt)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {instanceId && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>
                                {totals.booked}
                            </strong>{' '}
                            of {totals.seats} seats taken across {sittings.length} sitting
                            {sittings.length === 1 ? '' : 's'}
                        </div>
                    )}
                </div>

                {/* Practice and trial papers never run to a timetable, so saying so
                    here is more useful than showing empty panels for them. */}
                {selectedExam?.isTrial && (
                    <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            This is the trial/rehearsal paper. It is free, unscored and retakeable,
                            so it never uses sittings — participants can take it at any time.
                        </p>
                    </div>
                )}

                {selectedExam && !selectedExam.isTrial && selectedExam.requiresSlot === false && (
                    <div
                        className="glass-card"
                        style={{
                            padding: 'var(--space-4)',
                            marginBottom: 'var(--space-6)',
                            borderLeft: '3px solid var(--warning-400, #f59e0b)',
                        }}
                    >
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                            <strong>Sittings are switched off for this exam.</strong> It can be sat
                            at any point inside its window and nobody is auto-scheduled. Turn
                            &ldquo;requires slot&rdquo; back on from the Exams page to use the
                            schedule below.
                        </p>
                    </div>
                )}

                {!instanceId ? (
                    <div
                        className="glass-card"
                        style={{ padding: 'var(--space-16)', textAlign: 'center' }}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>🗓️</div>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Pick an exam and window to manage its schedule.
                        </p>
                    </div>
                ) : loading ? (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: 'var(--space-16)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Loading schedule…
                    </div>
                ) : (
                    <>
                        <RulesPanel
                            instanceId={instanceId}
                            rules={rules}
                            onSaved={(next) => {
                                setRules((r) => (r ? { ...r, ...next } : r));
                                setBanner({
                                    tone: 'ok',
                                    text: 'Assignment rules saved. They apply to participants scheduled from now on.',
                                });
                            }}
                            onError={(text) => setBanner({ tone: 'err', text })}
                        />

                        <TimingsPanel
                            instanceId={instanceId}
                            timings={timings}
                            onChanged={(text) => {
                                setBanner({ tone: 'ok', text });
                                refresh();
                            }}
                            onError={(text) => setBanner({ tone: 'err', text })}
                        />

                        <SittingsPanel
                            sittings={sittings}
                            onChanged={(text) => {
                                setBanner({ tone: 'ok', text });
                                refresh();
                            }}
                            onError={(text) => setBanner({ tone: 'err', text })}
                            onOpenRoster={async (sitting) => {
                                setRoster({ sitting, students: [] });
                                setRosterLoading(true);
                                try {
                                    const { data } = await api.get<SittingStudent[]>(
                                        `/admin/slots/${sitting.id}/students`,
                                    );
                                    setRoster({ sitting, students: data });
                                } catch (err) {
                                    setBanner({
                                        tone: 'err',
                                        text: errorOf(err, 'Could not load that sitting’s roster.'),
                                    });
                                    setRoster(null);
                                } finally {
                                    setRosterLoading(false);
                                }
                            }}
                        />

                        <UnassignedPanel
                            instanceId={instanceId}
                            students={unassigned}
                            sittings={sittings}
                            onChanged={(text) => {
                                setBanner({ tone: 'ok', text });
                                refresh();
                            }}
                            onError={(text) => setBanner({ tone: 'err', text })}
                        />
                    </>
                )}

                {roster && (
                    <RosterModal
                        sitting={roster.sitting}
                        students={roster.students}
                        loading={rosterLoading}
                        sittings={sittings}
                        moveTarget={moveTarget}
                        setMoveTarget={setMoveTarget}
                        movingId={movingId}
                        onClose={() => setRoster(null)}
                        onMove={async (userId) => {
                            const slotId = moveTarget[userId];
                            if (!slotId) return;
                            setMovingId(userId);
                            try {
                                await api.put(`/admin/students/${userId}/schedule`, { slotId });
                                setBanner({
                                    tone: 'ok',
                                    text: 'Participant moved. They have been sent their new date.',
                                });
                                setRoster(null);
                                refresh();
                            } catch (err) {
                                setBanner({
                                    tone: 'err',
                                    text: errorOf(err, 'Could not move that participant.'),
                                });
                            } finally {
                                setMovingId(null);
                            }
                        }}
                    />
                )}
            </main>
        </AuthGuard>
    );
}

// ── Assignment rules ──────────────────────────────────────────────────────────

function RulesPanel({
    instanceId,
    rules,
    onSaved,
    onError,
}: {
    instanceId: string;
    rules: AssignmentRules | null;
    onSaved: (next: Partial<AssignmentRules>) => void;
    onError: (text: string) => void;
}) {
    const [lead, setLead] = useState(14);
    const [horizon, setHorizon] = useState(56);
    const [preference, setPreference] = useState<number[]>([0, 6]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!rules) return;
        setLead(rules.slotLeadDays);
        setHorizon(rules.slotHorizonDays);
        setPreference(rules.slotDayPreference);
    }, [rules]);

    if (!rules) return null;

    /**
     * Preference is an *ordered* list, so the control has to express order, not
     * just membership. Clicking a day appends it (or removes it) — the resulting
     * sentence is rendered underneath so the admin can read the rule back in
     * plain English before saving it.
     */
    const toggleDay = (day: number) =>
        setPreference((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
        );

    const save = async (e: FormEvent) => {
        e.preventDefault();
        if (preference.length === 0) {
            onError('Pick at least one preferred day.');
            return;
        }
        if (horizon < lead) {
            onError('The latest date must be further out than the earliest.');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.put<AssignmentRules>(
                `/admin/exams/instances/${instanceId}/assignment-rules`,
                {
                    slotLeadDays: lead,
                    slotHorizonDays: horizon,
                    slotDayPreference: preference,
                },
            );
            onSaved(data);
        } catch (err) {
            onError(errorOf(err, 'Could not save the assignment rules.'));
        } finally {
            setSaving(false);
        }
    };

    const sentence =
        preference.length > 0
            ? `Each participant is offered the first ${WEEKDAY_FULL[preference[0]]} at least ${lead} days after they register. ` +
              `If it is full, the next ${WEEKDAY_FULL[preference[0]]}, and so on up to ${horizon} days out` +
              (preference.length > 1
                  ? `. Only then are ${preference
                        .slice(1)
                        .map((d) => `${WEEKDAY_FULL[d]}s`)
                        .join(', then ')} tried, in the same way.`
                  : '.')
            : '';

    return (
        <section className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                Assignment rules
            </h2>
            <p
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    marginBottom: 'var(--space-5)',
                }}
            >
                How far ahead participants are scheduled, and which days are preferred.
            </p>

            <form onSubmit={save}>
                <div
                    style={{
                        display: 'flex',
                        gap: 'var(--space-5)',
                        flexWrap: 'wrap',
                        marginBottom: 'var(--space-5)',
                    }}
                >
                    <div style={{ flex: '1 1 180px' }}>
                        <label className="input-label" htmlFor="lead">
                            Earliest sitting (days after registering)
                        </label>
                        <input
                            id="lead"
                            className="input-field"
                            type="number"
                            min={0}
                            max={365}
                            value={lead}
                            onChange={(e) => setLead(Number(e.target.value))}
                        />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                        <label className="input-label" htmlFor="horizon">
                            Latest sitting (days after registering)
                        </label>
                        <input
                            id="horizon"
                            className="input-field"
                            type="number"
                            min={1}
                            max={730}
                            value={horizon}
                            onChange={(e) => setHorizon(Number(e.target.value))}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                    <span className="input-label">Preferred days, in order</span>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {WEEKDAYS.map((d) => {
                            const rank = preference.indexOf(d.value);
                            const on = rank >= 0;
                            return (
                                <button
                                    key={d.value}
                                    type="button"
                                    onClick={() => toggleDay(d.value)}
                                    aria-pressed={on}
                                    style={{
                                        padding: 'var(--space-2) var(--space-4)',
                                        borderRadius: 'var(--radius-full)',
                                        border: on
                                            ? '1px solid var(--primary-400)'
                                            : '1px solid var(--border-default)',
                                        background: on ? 'rgba(255,203,5,0.14)' : 'var(--bg-input)',
                                        color: on ? 'var(--primary-400)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: on ? 600 : 400,
                                    }}
                                >
                                    {on && (
                                        <span style={{ opacity: 0.7, marginRight: 4 }}>
                                            {rank + 1}.
                                        </span>
                                    )}
                                    {d.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {sentence && (
                    <p
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-elevated)',
                            padding: 'var(--space-3) var(--space-4)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-5)',
                            lineHeight: 1.6,
                        }}
                    >
                        {sentence}
                    </p>
                )}

                <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save rules'}
                </button>
            </form>
        </section>
    );
}

// ── Slot timings ──────────────────────────────────────────────────────────────

const BLANK_TIMING = {
    label: '',
    startTime: '10:00',
    endTime: '12:00',
    capacity: 50,
    weekdays: [0, 6] as number[],
    isActive: true,
};

function TimingsPanel({
    instanceId,
    timings,
    onChanged,
    onError,
}: {
    instanceId: string;
    timings: SlotTiming[];
    onChanged: (text: string) => void;
    onError: (text: string) => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState(BLANK_TIMING);
    const [saving, setSaving] = useState(false);

    const openCreate = () => {
        setForm(BLANK_TIMING);
        setEditingId(null);
        setCreating(true);
    };

    const openEdit = (t: SlotTiming) => {
        setForm({
            label: t.label ?? '',
            startTime: t.startTime,
            endTime: t.endTime,
            capacity: t.capacity,
            weekdays: t.weekdays,
            isActive: t.isActive,
        });
        setEditingId(t.id);
        setCreating(false);
    };

    const close = () => {
        setCreating(false);
        setEditingId(null);
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (form.weekdays.length === 0) {
            onError('Pick at least one day for this timing.');
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/admin/slot-timings/${editingId}`, {
                    label: form.label,
                    startTime: form.startTime,
                    endTime: form.endTime,
                    capacity: form.capacity,
                    weekdays: form.weekdays,
                    isActive: form.isActive,
                });
                onChanged(
                    'Timing updated. Sittings that already exist keep their current times and seats — edit those individually if you need to move them.',
                );
            } else {
                await api.post('/admin/slot-timings', {
                    examInstanceId: instanceId,
                    ...form,
                    label: form.label || undefined,
                });
                onChanged('Timing added. Sittings will be created from it as participants need them.');
            }
            close();
        } catch (err) {
            onError(errorOf(err, 'Could not save that timing.'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (t: SlotTiming) => {
        if (
            !confirm(
                `Delete the ${t.startTime}–${t.endTime} timing on ${t.weekdayNames.join(', ')}?\n\nAny empty sittings created from it are removed too. This cannot be undone.`,
            )
        )
            return;
        try {
            await api.delete(`/admin/slot-timings/${t.id}`);
            onChanged('Timing deleted.');
        } catch (err) {
            onError(errorOf(err, 'Could not delete that timing.'));
        }
    };

    const toggleDay = (day: number) =>
        setForm((f) => ({
            ...f,
            weekdays: f.weekdays.includes(day)
                ? f.weekdays.filter((d) => d !== day)
                : [...f.weekdays, day].sort((a, b) => a - b),
        }));

    return (
        <section className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 'var(--space-4)',
                    marginBottom: 'var(--space-5)',
                }}
            >
                <div>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Slot timings</h2>
                    <p
                        style={{
                            color: 'var(--text-secondary)',
                            fontSize: '0.875rem',
                            marginTop: 'var(--space-1)',
                        }}
                    >
                        The recurring sittings. Dated sittings are created from these automatically.
                    </p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={openCreate}>
                    + Add timing
                </button>
            </div>

            {timings.length === 0 ? (
                <p
                    style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        padding: 'var(--space-6)',
                        textAlign: 'center',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    No timings yet. Until you add one, nobody can be scheduled for this exam.
                </p>
            ) : (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Timing</th>
                                <th>Days</th>
                                <th>Seats each</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {timings.map((t) => (
                                <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                                    <td>
                                        <strong>
                                            {t.startTime} – {t.endTime}
                                        </strong>
                                        {t.label && (
                                            <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {t.label}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '0.875rem' }}>
                                        {t.weekdayNames.join(', ')}
                                    </td>
                                    <td>{t.capacity}</td>
                                    <td>
                                        <span
                                            className={`badge ${t.isActive ? 'badge-success' : 'badge-muted'}`}
                                        >
                                            {t.isActive ? 'Active' : 'Paused'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => openEdit(t)}
                                        >
                                            Edit
                                        </button>{' '}
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => remove(t)}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {(creating || editingId) && (
                <Modal title={editingId ? 'Edit timing' : 'Add timing'} onClose={close}>
                    <form onSubmit={submit}>
                        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 140px' }}>
                                <label className="input-label" htmlFor="t-start">
                                    Starts (IST)
                                </label>
                                <input
                                    id="t-start"
                                    className="input-field"
                                    type="time"
                                    value={form.startTime}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, startTime: e.target.value }))
                                    }
                                    required
                                />
                            </div>
                            <div style={{ flex: '1 1 140px' }}>
                                <label className="input-label" htmlFor="t-end">
                                    Ends (IST)
                                </label>
                                <input
                                    id="t-end"
                                    className="input-field"
                                    type="time"
                                    value={form.endTime}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, endTime: e.target.value }))
                                    }
                                    required
                                />
                            </div>
                            <div style={{ flex: '1 1 120px' }}>
                                <label className="input-label" htmlFor="t-cap">
                                    Seats
                                </label>
                                <input
                                    id="t-cap"
                                    className="input-field"
                                    type="number"
                                    min={1}
                                    value={form.capacity}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, capacity: Number(e.target.value) }))
                                    }
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: 'var(--space-4)' }}>
                            <label className="input-label" htmlFor="t-label">
                                Label (optional)
                            </label>
                            <input
                                id="t-label"
                                className="input-field"
                                value={form.label}
                                placeholder="Morning sitting"
                                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                            />
                        </div>

                        <div style={{ marginTop: 'var(--space-4)' }}>
                            <span className="input-label">Runs on</span>
                            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                {WEEKDAYS.map((d) => {
                                    const on = form.weekdays.includes(d.value);
                                    return (
                                        <button
                                            key={d.value}
                                            type="button"
                                            onClick={() => toggleDay(d.value)}
                                            aria-pressed={on}
                                            style={{
                                                padding: 'var(--space-2) var(--space-4)',
                                                borderRadius: 'var(--radius-full)',
                                                border: on
                                                    ? '1px solid var(--primary-400)'
                                                    : '1px solid var(--border-default)',
                                                background: on
                                                    ? 'rgba(255,203,5,0.14)'
                                                    : 'var(--bg-input)',
                                                color: on
                                                    ? 'var(--primary-400)'
                                                    : 'var(--text-secondary)',
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

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-2)',
                                marginTop: 'var(--space-4)',
                                fontSize: '0.9rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                                }
                            />
                            Active — new participants can be scheduled into it
                        </label>

                        <div
                            style={{
                                display: 'flex',
                                gap: 'var(--space-3)',
                                justifyContent: 'flex-end',
                                marginTop: 'var(--space-6)',
                            }}
                        >
                            <button type="button" className="btn btn-secondary" onClick={close}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Saving…' : editingId ? 'Save timing' : 'Add timing'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </section>
    );
}

// ── Dated sittings ────────────────────────────────────────────────────────────

function SittingsPanel({
    sittings,
    onChanged,
    onError,
    onOpenRoster,
}: {
    sittings: Sitting[];
    onChanged: (text: string) => void;
    onError: (text: string) => void;
    onOpenRoster: (sitting: Sitting) => void;
}) {
    const [editing, setEditing] = useState<Sitting | null>(null);
    const [capacity, setCapacity] = useState(50);
    const [saving, setSaving] = useState(false);

    const openEdit = (s: Sitting) => {
        setEditing(s);
        setCapacity(s.capacity);
    };

    const saveCapacity = async (e: FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        setSaving(true);
        try {
            await api.put(`/admin/slots/${editing.id}`, { capacity });
            onChanged(`Seats for ${fmtDate(editing.startsAt)} set to ${capacity}.`);
            setEditing(null);
        } catch (err) {
            onError(errorOf(err, 'Could not change the seat count.'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (s: Sitting) => {
        if (!confirm(`Delete the sitting on ${fmtDate(s.startsAt)} at ${fmtTime(s.startsAt)}?`))
            return;
        try {
            await api.delete(`/admin/slots/${s.id}`);
            onChanged('Sitting deleted.');
        } catch (err) {
            onError(errorOf(err, 'Could not delete that sitting.'));
        }
    };

    return (
        <section className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Upcoming sittings</h2>
            <p
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    marginTop: 'var(--space-1)',
                    marginBottom: 'var(--space-5)',
                }}
            >
                Created automatically as participants are scheduled. Top up the seats on a busy date,
                or open one to see and move who is in it.
            </p>

            {sittings.length === 0 ? (
                <p
                    style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        padding: 'var(--space-6)',
                        textAlign: 'center',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    No sittings yet. One is created the first time a participant is scheduled onto
                    that date.
                </p>
            ) : (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time (IST)</th>
                                <th style={{ minWidth: 170 }}>Seats</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sittings.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <strong>{fmtDate(s.startsAt)}</strong>
                                        {(s.label ?? s.timing?.label) && (
                                            <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {s.label ?? s.timing?.label}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '0.875rem' }}>
                                        {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                                    </td>
                                    <td>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--space-3)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    flex: 1,
                                                    height: 6,
                                                    borderRadius: 3,
                                                    background: 'var(--bg-elevated)',
                                                    overflow: 'hidden',
                                                    minWidth: 60,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${Math.min(100, s.capacity > 0 ? (s.booked / s.capacity) * 100 : 100)}%`,
                                                        height: '100%',
                                                        background: fillColor(s.booked, s.capacity),
                                                    }}
                                                />
                                            </div>
                                            <span
                                                style={{
                                                    fontSize: '0.85rem',
                                                    whiteSpace: 'nowrap',
                                                    color: s.isFull
                                                        ? 'var(--danger-400, #ef4444)'
                                                        : 'var(--text-secondary)',
                                                }}
                                            >
                                                {s.booked}/{s.capacity}
                                                {s.isFull ? ' · full' : ''}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => onOpenRoster(s)}
                                            disabled={s.booked === 0}
                                            title={
                                                s.booked === 0
                                                    ? 'Nobody is in this sitting yet'
                                                    : undefined
                                            }
                                        >
                                            {s.booked} participant{s.booked === 1 ? '' : 's'}
                                        </button>{' '}
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => openEdit(s)}
                                        >
                                            Seats
                                        </button>{' '}
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => remove(s)}
                                            disabled={s.booked > 0}
                                            title={
                                                s.booked > 0
                                                    ? 'Move the participants out before deleting'
                                                    : undefined
                                            }
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={`Seats — ${fmtDate(editing.startsAt)}`} onClose={() => setEditing(null)}>
                    <form onSubmit={saveCapacity}>
                        <label className="input-label" htmlFor="cap">
                            Seats for this sitting
                        </label>
                        <input
                            id="cap"
                            className="input-field"
                            type="number"
                            min={editing.booked || 1}
                            value={capacity}
                            onChange={(e) => setCapacity(Number(e.target.value))}
                            required
                        />
                        <p
                            style={{
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                marginTop: 'var(--space-2)',
                            }}
                        >
                            {editing.booked} participant{editing.booked === 1 ? ' is' : 's are'}{' '}
                            already scheduled here, so this cannot go below {editing.booked}.
                        </p>
                        <div
                            style={{
                                display: 'flex',
                                gap: 'var(--space-3)',
                                justifyContent: 'flex-end',
                                marginTop: 'var(--space-6)',
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setEditing(null)}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Saving…' : 'Save seats'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </section>
    );
}

// ── Unscheduled participants ──────────────────────────────────────────────────

function UnassignedPanel({
    instanceId,
    students,
    sittings,
    onChanged,
    onError,
}: {
    instanceId: string;
    students: UnassignedStudent[];
    sittings: Sitting[];
    onChanged: (text: string) => void;
    onError: (text: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [target, setTarget] = useState<Record<string, string>>({});
    const [placingId, setPlacingId] = useState<string | null>(null);

    const backfill = async () => {
        setBusy(true);
        try {
            const { data } = await api.post<{
                considered: number;
                assigned: number;
                unassigned: number;
                failures: { userId: string; message: string }[];
            }>(`/admin/exams/instances/${instanceId}/backfill-slots`);
            onChanged(
                `Scheduled ${data.assigned} of ${data.considered} participant(s).` +
                    (data.unassigned > 0
                        ? ` ${data.unassigned} still could not be placed${data.failures[0] ? `: ${data.failures[0].message}` : '.'}`
                        : ''),
            );
        } catch (err) {
            onError(errorOf(err, 'Could not run the scheduling sweep.'));
        } finally {
            setBusy(false);
        }
    };

    const place = async (userId: string) => {
        const slotId = target[userId];
        if (!slotId) return;
        setPlacingId(userId);
        try {
            await api.put(`/admin/students/${userId}/schedule`, { slotId });
            onChanged('Participant scheduled and told their date.');
        } catch (err) {
            onError(errorOf(err, 'Could not schedule that participant.'));
        } finally {
            setPlacingId(null);
        }
    };

    return (
        <section className="glass-card" style={{ padding: 'var(--space-6)' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 'var(--space-4)',
                    marginBottom: 'var(--space-5)',
                }}
            >
                <div>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                        Not yet scheduled
                        {students.length > 0 && (
                            <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                                {students.length}
                            </span>
                        )}
                    </h2>
                    <p
                        style={{
                            color: 'var(--text-secondary)',
                            fontSize: '0.875rem',
                            marginTop: 'var(--space-1)',
                        }}
                    >
                        Eligible participants with no sitting — usually because they registered
                        before any timing existed, or every date in their window was full.
                    </p>
                </div>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={backfill}
                    disabled={busy || students.length === 0}
                >
                    {busy ? 'Scheduling…' : 'Schedule everyone'}
                </button>
            </div>

            {students.length === 0 ? (
                <p
                    style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        padding: 'var(--space-6)',
                        textAlign: 'center',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    Everyone eligible for this exam has a sitting.
                </p>
            ) : (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Participant</th>
                                <th>Class</th>
                                <th>School</th>
                                <th>Registered</th>
                                <th style={{ minWidth: 260 }}>Place into</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <div className="student-name">
                                            <strong>
                                                {s.firstName} {s.lastName}
                                            </strong>
                                            <span className="join-date">
                                                {s.rollNumber ?? s.email}
                                            </span>
                                        </div>
                                    </td>
                                    <td>{s.classBand ?? '—'}</td>
                                    <td style={{ fontSize: '0.875rem' }}>{s.school?.name ?? '—'}</td>
                                    <td style={{ fontSize: '0.85rem' }}>
                                        {fmtDate(s.activatedAt ?? s.createdAt)}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                            <select
                                                className="input-field"
                                                style={{ padding: 'var(--space-2) var(--space-3)' }}
                                                value={target[s.id] ?? ''}
                                                onChange={(e) =>
                                                    setTarget((t) => ({
                                                        ...t,
                                                        [s.id]: e.target.value,
                                                    }))
                                                }
                                            >
                                                <option value="">Choose a sitting…</option>
                                                {sittings.map((sitting) => (
                                                    <option
                                                        key={sitting.id}
                                                        value={sitting.id}
                                                        disabled={sitting.isFull}
                                                    >
                                                        {fmtDate(sitting.startsAt)}{' '}
                                                        {fmtTime(sitting.startsAt)} —{' '}
                                                        {sitting.seatsLeft} left
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => place(s.id)}
                                                disabled={!target[s.id] || placingId === s.id}
                                            >
                                                {placingId === s.id ? '…' : 'Place'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

// ── Roster ────────────────────────────────────────────────────────────────────

function RosterModal({
    sitting,
    students,
    loading,
    sittings,
    moveTarget,
    setMoveTarget,
    movingId,
    onClose,
    onMove,
}: {
    sitting: Sitting;
    students: SittingStudent[];
    loading: boolean;
    sittings: Sitting[];
    moveTarget: Record<string, string>;
    setMoveTarget: (fn: (t: Record<string, string>) => Record<string, string>) => void;
    movingId: string | null;
    onClose: () => void;
    onMove: (userId: string) => void;
}) {
    return (
        <Modal
            title={`${fmtDate(sitting.startsAt)} · ${fmtTime(sitting.startsAt)}–${fmtTime(sitting.endsAt)}`}
            onClose={onClose}
            wide
        >
            {loading ? (
                <p style={{ color: 'var(--text-secondary)', padding: 'var(--space-6)' }}>
                    Loading roster…
                </p>
            ) : students.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>Nobody is in this sitting.</p>
            ) : (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Participant</th>
                                <th>Class</th>
                                <th>School</th>
                                <th style={{ minWidth: 260 }}>Move to</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((b) => (
                                <tr key={b.id}>
                                    <td>
                                        <div className="student-name">
                                            <strong>
                                                {b.user.firstName} {b.user.lastName}
                                            </strong>
                                            <span className="join-date">
                                                {b.user.rollNumber ?? b.user.email}
                                            </span>
                                        </div>
                                    </td>
                                    <td>{b.user.classBand ?? '—'}</td>
                                    <td style={{ fontSize: '0.875rem' }}>
                                        {b.user.school?.name ?? '—'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                            <select
                                                className="input-field"
                                                style={{ padding: 'var(--space-2) var(--space-3)' }}
                                                value={moveTarget[b.user.id] ?? ''}
                                                onChange={(e) =>
                                                    setMoveTarget((t) => ({
                                                        ...t,
                                                        [b.user.id]: e.target.value,
                                                    }))
                                                }
                                            >
                                                <option value="">Choose a sitting…</option>
                                                {sittings
                                                    .filter((s) => s.id !== sitting.id)
                                                    .map((s) => (
                                                        <option
                                                            key={s.id}
                                                            value={s.id}
                                                            disabled={s.isFull}
                                                        >
                                                            {fmtDate(s.startsAt)}{' '}
                                                            {fmtTime(s.startsAt)} — {s.seatsLeft}{' '}
                                                            left
                                                        </option>
                                                    ))}
                                            </select>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => onMove(b.user.id)}
                                                disabled={
                                                    !moveTarget[b.user.id] || movingId === b.user.id
                                                }
                                            >
                                                {movingId === b.user.id ? '…' : 'Move'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
}

// ── Shared modal ──────────────────────────────────────────────────────────────

function Modal({
    title,
    onClose,
    children,
    wide,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}) {
    // Escape closes it — a modal that can only be dismissed by hitting a small
    // × is a trap for anyone working from the keyboard.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-4)',
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                className="glass-card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    padding: 'var(--space-6)',
                    width: '100%',
                    maxWidth: wide ? 880 : 520,
                    maxHeight: '85vh',
                    overflowY: 'auto',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-5)',
                        gap: 'var(--space-4)',
                    }}
                >
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{title}</h3>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
