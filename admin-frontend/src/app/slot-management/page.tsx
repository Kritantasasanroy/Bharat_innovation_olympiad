'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

/**
 * Slot management.
 *
 * The scheduling page next door is where the season is *configured*. This one
 * answers the only question that matters once it is running: **is there room,
 * and where?** Three views of the same numbers, because the three questions an
 * admin brings here have different shapes:
 *
 *  - the **headline** — how many places exist, how many are taken, how many
 *    participants still have no date at all;
 *  - the **calendar** — month grids, each day coloured by how full it is, which
 *    is the only layout in which "the middle Sundays are packed and October is
 *    empty" is visible at a glance;
 *  - the **chart and the day table** — the same days as bars and as rows, for
 *    reading off exact figures and for opening one day's sittings.
 *
 * Everything is derived from one `/slot-analytics` call, so the three can never
 * disagree with each other.
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

interface DaySitting {
    timingId: string | null;
    slotId: string | null;
    label: string | null;
    startTime: string | null;
    endTime: string | null;
    startsAt: string | null;
    capacity: number;
    booked: number;
    isOpen: boolean;
}

interface DayRow {
    scheduleDateId: string;
    date: string;
    weekday: string;
    priority: number;
    isActive: boolean;
    note: string | null;
    sittingsConfigured: number;
    sittingsOpen: number;
    sittingsFull: number;
    capacity: number;
    students: number;
    seatsLeft: number;
    schools: number;
    byClassBand: { classBand: number; students: number }[];
    sittings: DaySitting[];
}

interface Analytics {
    examInstanceId: string;
    exam: { id: string; title: string; classBands: number[]; durationMinutes: number };
    examWindow: { startsAt: string; endsAt: string };
    usesPublishedCalendar: boolean;
    totals: {
        days: number;
        blackoutDays: number;
        sittingsConfigured: number;
        sittingsOpen: number;
        sittingsFull: number;
        capacity: number;
        students: number;
        seatsLeft: number;
    };
    byPriority: {
        priority: number;
        days: number;
        sittingsConfigured: number;
        capacity: number;
        students: number;
        seatsLeft: number;
    }[];
    days: DayRow[];
}

const IST = 'Asia/Kolkata';

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        timeZone: IST,
    });
}

function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        timeZone: IST,
    });
}

function errorOf(err: unknown, fallback: string) {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
        ?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? fallback);
}

/**
 * Fullness as a colour, on one scale used by every view on the page.
 *
 * Green through amber to red, so scanning the calendar and scanning the chart
 * teach the same thing. A day with no places configured at all is grey rather
 * than green: "nothing here" and "plenty of room" are opposite situations and
 * must not look alike.
 */
function fillColor(booked: number, capacity: number) {
    if (capacity <= 0) return 'var(--border-default, #3f3f46)';
    const pct = (booked / capacity) * 100;
    if (pct >= 100) return '#ef4444';
    if (pct >= 85) return '#f59e0b';
    if (pct >= 50) return '#eab308';
    return '#22c55e';
}

/** Calendar days, in IST, keyed the way the analytics rows are. */
function istKey(iso: string) {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SlotManagementPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [examId, setExamId] = useState('');
    const [instances, setInstances] = useState<ExamInstance[]>([]);
    const [instanceId, setInstanceId] = useState('');
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(false);
    const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
    const [openDay, setOpenDay] = useState<string | null>(null);

    useEffect(() => {
        api.get<Exam[]>('/admin/exams')
            .then(({ data: list }) => {
                setExams(list);
                const first = list.find((e) => !e.isTrial && e.requiresSlot !== false);
                if (first) setExamId(first.id);
            })
            .catch(() => setExams([]));
    }, []);

    useEffect(() => {
        if (!examId) {
            setInstances([]);
            setInstanceId('');
            return;
        }
        api.get<ExamInstance[]>(`/admin/exams/${examId}/instances`)
            .then(({ data: list }) => {
                setInstances(list);
                setInstanceId(list.length ? list[0].id : '');
            })
            .catch(() => setInstances([]));
    }, [examId]);

    const load = useCallback(async (id: string) => {
        setLoading(true);
        try {
            const { data: analytics } = await api.get<Analytics>(
                `/admin/exams/instances/${id}/slot-analytics`,
            );
            setData(analytics);
        } catch (err) {
            setBanner({ tone: 'err', text: errorOf(err, 'Could not load the slot figures.') });
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!instanceId) {
            setData(null);
            return;
        }
        load(instanceId);
    }, [instanceId, load]);

    const chartData = useMemo(
        () =>
            (data?.days ?? [])
                .filter((d) => d.isActive)
                .map((d) => ({
                    name: fmtShort(d.date),
                    date: d.date,
                    priority: d.priority,
                    Scheduled: d.students,
                    Remaining: d.seatsLeft,
                    capacity: d.capacity,
                })),
        [data],
    );

    const selected = data?.days.find((d) => d.date === openDay) ?? null;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main
                className="container animate-fade-in"
                style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}
            >
                <header
                    style={{
                        marginBottom: 'var(--space-6)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 'var(--space-4)',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ flex: '1 1 420px' }}>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Slot Management</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                            How full the season is, day by day. Configure the dates and times on the
                            scheduling page; this is where you watch them fill and top up the days
                            that need it.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <a className="btn btn-secondary" href="/slots">
                            Exam scheduling
                        </a>
                    </div>
                </header>

                {banner && (
                    <div
                        className="glass-card"
                        style={{
                            padding: 'var(--space-4)',
                            marginBottom: 'var(--space-5)',
                            borderLeft: `3px solid ${banner.tone === 'ok' ? '#22c55e' : '#ef4444'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 'var(--space-4)',
                        }}
                    >
                        <span style={{ fontSize: '0.9rem' }}>{banner.text}</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setBanner(null)}>
                            Dismiss
                        </button>
                    </div>
                )}

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
                    <div style={{ flex: '1 1 320px' }}>
                        <label className="input-label" htmlFor="sm-exam">
                            Exam
                        </label>
                        <select
                            id="sm-exam"
                            className="input-field"
                            value={examId}
                            onChange={(e) => setExamId(e.target.value)}
                        >
                            <option value="">Select an exam…</option>
                            {exams.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.title}
                                </option>
                            ))}
                        </select>
                    </div>
                    {instances.length > 1 && (
                        <div style={{ flex: '1 1 280px' }}>
                            <label className="input-label" htmlFor="sm-instance">
                                Window
                            </label>
                            <select
                                id="sm-instance"
                                className="input-field"
                                value={instanceId}
                                onChange={(e) => setInstanceId(e.target.value)}
                            >
                                {instances.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {fmtDate(i.startsAt)} – {fmtDate(i.endsAt)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: 'var(--space-16)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Loading slot figures…
                    </div>
                ) : !data ? (
                    <div
                        className="glass-card"
                        style={{ padding: 'var(--space-16)', textAlign: 'center' }}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>📊</div>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Pick an exam to see how its dates are filling.
                        </p>
                    </div>
                ) : (
                    <>
                        <Headline data={data} />
                        {!data.usesPublishedCalendar && (
                            <div
                                className="glass-card"
                                style={{
                                    padding: 'var(--space-4)',
                                    marginBottom: 'var(--space-6)',
                                    borderLeft: '3px solid #f59e0b',
                                    fontSize: '0.9rem',
                                }}
                            >
                                This exam has no published dates yet, so there is nothing to fill.
                                Add them — or load the published season — on{' '}
                                <a href="/slots" style={{ color: 'var(--primary-400)' }}>
                                    the scheduling page
                                </a>
                                .
                            </div>
                        )}
                        <CalendarView days={data.days} onOpenDay={setOpenDay} />
                        <DayChart data={chartData} onOpenDay={setOpenDay} />
                        <DayTable days={data.days} onOpenDay={setOpenDay} />
                    </>
                )}

                {selected && <DayDetail day={selected} onClose={() => setOpenDay(null)} />}
            </main>
        </AuthGuard>
    );
}

// ── Headline ──────────────────────────────────────────────────────────────────

function Headline({ data }: { data: Analytics }) {
    const { totals } = data;
    const pct = totals.capacity > 0 ? Math.round((totals.students / totals.capacity) * 100) : 0;

    const cards = [
        {
            label: 'Sittings configured',
            value: totals.sittingsConfigured,
            hint: `across ${totals.days} exam day${totals.days === 1 ? '' : 's'}${
                totals.blackoutDays ? ` · ${totals.blackoutDays} closed` : ''
            }`,
        },
        {
            label: 'Places configured',
            value: totals.capacity.toLocaleString('en-IN'),
            hint: `${totals.sittingsOpen} sitting${totals.sittingsOpen === 1 ? '' : 's'} opened so far`,
        },
        {
            label: 'Scheduled',
            value: totals.students.toLocaleString('en-IN'),
            hint: `${pct}% of the season filled`,
        },
        {
            label: 'Places remaining',
            value: totals.seatsLeft.toLocaleString('en-IN'),
            hint: `${totals.sittingsFull} sitting${totals.sittingsFull === 1 ? '' : 's'} full`,
            tone: totals.seatsLeft === 0 ? 'bad' : undefined,
        },
    ];

    return (
        <>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--space-4)',
                    marginBottom: 'var(--space-5)',
                }}
            >
                {cards.map((c) => (
                    <div key={c.label} className="glass-card" style={{ padding: 'var(--space-5)' }}>
                        <div
                            style={{
                                fontSize: '0.75rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {c.label}
                        </div>
                        <div
                            style={{
                                fontSize: '1.9rem',
                                fontWeight: 700,
                                marginTop: 'var(--space-2)',
                                color:
                                    c.tone === 'bad'
                                        ? '#ef4444'
                                        : c.tone === 'good'
                                          ? '#22c55e'
                                          : undefined,
                            }}
                        >
                            {c.value}
                        </div>
                        <div
                            className="text-muted"
                            style={{ fontSize: '0.78rem', marginTop: 'var(--space-1)' }}
                        >
                            {c.hint}
                        </div>
                    </div>
                ))}
            </div>

            {data.byPriority.length > 0 && (
                <section
                    className="glass-card"
                    style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}
                >
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                        By priority
                    </h2>
                    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                        {data.byPriority.map((tier) => {
                            const filled =
                                tier.capacity > 0 ? (tier.students / tier.capacity) * 100 : 0;
                            return (
                                <div key={tier.priority}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontSize: '0.875rem',
                                            marginBottom: 'var(--space-2)',
                                            flexWrap: 'wrap',
                                            gap: 'var(--space-2)',
                                        }}
                                    >
                                        <strong>
                                            Priority {tier.priority}
                                            {tier.priority === 1 ? ' — filled first' : ' — overflow'}
                                        </strong>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            {tier.days} day{tier.days === 1 ? '' : 's'} ·{' '}
                                            {tier.sittingsConfigured} sittings ·{' '}
                                            {tier.students.toLocaleString('en-IN')} /{' '}
                                            {tier.capacity.toLocaleString('en-IN')} places ·{' '}
                                            {tier.seatsLeft.toLocaleString('en-IN')} left
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            height: 10,
                                            borderRadius: 5,
                                            background: 'var(--bg-elevated)',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${Math.min(100, filled)}%`,
                                                height: '100%',
                                                background: fillColor(tier.students, tier.capacity),
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
        </>
    );
}

// ── Calendar ──────────────────────────────────────────────────────────────────

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * One grid per month the season touches.
 *
 * Only the months that actually carry exam dates are drawn — an empty December
 * grid would be six rows of nothing pretending to be information. Days with no
 * sitting are faint, so the pattern of exam days reads as a pattern rather than
 * as a wall of boxes.
 */
function CalendarView({ days, onOpenDay }: { days: DayRow[]; onOpenDay: (d: string) => void }) {
    const byDate = useMemo(() => {
        const map = new Map<string, DayRow>();
        for (const d of days) map.set(istKey(d.date), d);
        return map;
    }, [days]);

    const months = useMemo(() => {
        const seen = new Map<string, { year: number; month: number }>();
        for (const d of days) {
            const key = istKey(d.date);
            const [y, m] = key.split('-').map(Number);
            seen.set(`${y}-${m}`, { year: y, month: m - 1 });
        }
        return Array.from(seen.values()).sort((a, b) => a.year - b.year || a.month - b.month);
    }, [days]);

    if (months.length === 0) return null;

    return (
        <section
            className="glass-card"
            style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}
        >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Calendar</h2>
            <p
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    marginTop: 'var(--space-1)',
                    marginBottom: 'var(--space-5)',
                }}
            >
                Each exam day shows the participants scheduled on it and how full it is. Click a day
                to see its sittings.
            </p>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--space-5)',
                }}
            >
                {months.map(({ year, month }) => {
                    const first = new Date(Date.UTC(year, month, 1));
                    const leading = first.getUTCDay();
                    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
                    const cells: (string | null)[] = [
                        ...Array(leading).fill(null),
                        ...Array.from(
                            { length: daysInMonth },
                            (_, i) =>
                                `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
                        ),
                    ];

                    return (
                        <div key={`${year}-${month}`}>
                            <h3
                                style={{
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    marginBottom: 'var(--space-3)',
                                }}
                            >
                                {first.toLocaleDateString('en-IN', {
                                    month: 'long',
                                    year: 'numeric',
                                    timeZone: 'UTC',
                                })}
                            </h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7, 1fr)',
                                    gap: 4,
                                }}
                            >
                                {WEEKDAY_INITIALS.map((w, i) => (
                                    <div
                                        key={`${w}-${i}`}
                                        style={{
                                            textAlign: 'center',
                                            fontSize: '0.7rem',
                                            color: 'var(--text-secondary)',
                                            paddingBottom: 4,
                                        }}
                                    >
                                        {w}
                                    </div>
                                ))}
                                {cells.map((key, i) => {
                                    if (!key) return <div key={`pad-${i}`} />;
                                    const row = byDate.get(key);
                                    const dayNumber = Number(key.slice(-2));

                                    if (!row) {
                                        return (
                                            <div
                                                key={key}
                                                style={{
                                                    aspectRatio: '1',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.72rem',
                                                    color: 'var(--text-secondary)',
                                                    opacity: 0.35,
                                                }}
                                            >
                                                {dayNumber}
                                            </div>
                                        );
                                    }

                                    const closed = !row.isActive;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => onOpenDay(row.date)}
                                            title={
                                                closed
                                                    ? `${fmtDate(row.date)} — ${row.note ?? 'closed'}`
                                                    : `${fmtDate(row.date)} — ${row.students}/${row.capacity} places, priority ${row.priority}`
                                            }
                                            style={{
                                                aspectRatio: '1',
                                                borderRadius: 'var(--radius-sm, 6px)',
                                                border: `1px solid ${
                                                    closed
                                                        ? 'var(--border-default)'
                                                        : fillColor(row.students, row.capacity)
                                                }`,
                                                background: closed
                                                    ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, var(--bg-elevated) 3px, var(--bg-elevated) 6px)'
                                                    : 'var(--bg-input)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 1,
                                                padding: 2,
                                                color: 'inherit',
                                            }}
                                        >
                                            <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                                {dayNumber}
                                            </span>
                                            {closed ? (
                                                <span
                                                    style={{
                                                        fontSize: '0.6rem',
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >
                                                    closed
                                                </span>
                                            ) : (
                                                <>
                                                    <span
                                                        style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            color: fillColor(
                                                                row.students,
                                                                row.capacity,
                                                            ),
                                                        }}
                                                    >
                                                        {row.students}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: '0.55rem',
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        P{row.priority}
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap',
                    marginTop: 'var(--space-5)',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                }}
            >
                {[
                    ['#22c55e', 'Under half full'],
                    ['#eab308', 'Half full'],
                    ['#f59e0b', 'Nearly full'],
                    ['#ef4444', 'Full'],
                ].map(([colour, label]) => (
                    <span
                        key={label}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                    >
                        <span
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                border: `2px solid ${colour}`,
                            }}
                        />
                        {label}
                    </span>
                ))}
            </div>
        </section>
    );
}

// ── Chart ─────────────────────────────────────────────────────────────────────

interface ChartRow {
    name: string;
    date: string;
    priority: number;
    Scheduled: number;
    Remaining: number;
    capacity: number;
}

/**
 * Scheduled and remaining, stacked, one bar per exam day.
 *
 * Stacked rather than side by side because the pair sums to something real —
 * the day's configured places — so the bar height is the capacity and the split
 * is how much of it is gone. Two separate bars would show the same numbers and
 * hide that relationship.
 */
function DayChart({ data, onOpenDay }: { data: ChartRow[]; onOpenDay: (d: string) => void }) {
    if (data.length === 0) return null;

    return (
        <section
            className="glass-card"
            style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}
        >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Participants per day</h2>
            <p
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    marginTop: 'var(--space-1)',
                    marginBottom: 'var(--space-5)',
                }}
            >
                Bar height is the places configured for the day; the solid part is how many are
                taken.
            </p>
            <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            interval={0}
                            angle={-35}
                            textAnchor="end"
                            height={56}
                        />
                        <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} />
                        <Tooltip
                            contentStyle={{
                                background: 'rgba(17,24,39,0.95)',
                                border: '1px solid rgba(148,163,184,0.25)',
                                borderRadius: 8,
                                fontSize: 12,
                                color: '#f8fafc',
                            }}
                            labelFormatter={(label, payload) => {
                                const row = (
                                    payload as unknown as
                                        | readonly { payload?: ChartRow }[]
                                        | undefined
                                )?.[0]?.payload;
                                return row ? `${label} · Priority ${row.priority}` : label;
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                            dataKey="Scheduled"
                            stackId="places"
                            cursor="pointer"
                            onClick={(bar: { payload?: ChartRow }) => {
                                if (bar?.payload) onOpenDay(bar.payload.date);
                            }}
                        >
                            {data.map((row) => (
                                <Cell
                                    key={row.date}
                                    fill={fillColor(row.Scheduled, row.capacity)}
                                />
                            ))}
                        </Bar>
                        <Bar
                            dataKey="Remaining"
                            stackId="places"
                            fill="rgba(148,163,184,0.25)"
                            cursor="pointer"
                            onClick={(bar: { payload?: ChartRow }) => {
                                if (bar?.payload) onOpenDay(bar.payload.date);
                            }}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}

// ── Day table ─────────────────────────────────────────────────────────────────

function DayTable({ days, onOpenDay }: { days: DayRow[]; onOpenDay: (d: string) => void }) {
    if (days.length === 0) return null;

    return (
        <section
            className="glass-card"
            style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}
        >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                Every exam day
            </h2>
            <div className="table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Priority</th>
                            <th>Sittings</th>
                            <th style={{ minWidth: 180 }}>Places</th>
                            <th>Schools</th>
                            <th style={{ textAlign: 'right' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {days.map((d) => (
                            <tr key={d.scheduleDateId} style={{ opacity: d.isActive ? 1 : 0.5 }}>
                                <td>
                                    <strong>{fmtDate(d.date)}</strong>
                                    {d.note && (
                                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                            {d.note}
                                        </div>
                                    )}
                                </td>
                                <td>{d.priority}</td>
                                <td style={{ fontSize: '0.875rem' }}>
                                    {d.isActive ? (
                                        <>
                                            {d.sittingsConfigured} configured
                                            <div
                                                className="text-muted"
                                                style={{ fontSize: '0.78rem' }}
                                            >
                                                {d.sittingsOpen} open · {d.sittingsFull} full
                                                {d.sittingsConfigured - d.sittingsOpen > 0 &&
                                                    ` · ${d.sittingsConfigured - d.sittingsOpen} not opened yet`}
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-muted">Closed</span>
                                    )}
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
                                                    width: `${d.capacity > 0 ? Math.min(100, (d.students / d.capacity) * 100) : 0}%`,
                                                    height: '100%',
                                                    background: fillColor(d.students, d.capacity),
                                                }}
                                            />
                                        </div>
                                        <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                            {d.students}/{d.capacity}
                                            {d.capacity > 0 &&
                                                (d.seatsLeft > 0 ? ` · ${d.seatsLeft} free` : ' · full')}
                                        </span>
                                    </div>
                                </td>
                                <td>{d.schools}</td>
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => onOpenDay(d.date)}
                                    >
                                        Sittings
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

// ── One day ───────────────────────────────────────────────────────────────────

function DayDetail({ day, onClose }: { day: DayRow; onClose: () => void }) {
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-4)',
                zIndex: 60,
            }}
        >
            <div
                className="glass-card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    padding: 'var(--space-6)',
                    width: 'min(680px, 100%)',
                    maxHeight: '86vh',
                    overflowY: 'auto',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 'var(--space-4)',
                        marginBottom: 'var(--space-4)',
                    }}
                >
                    <div>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{fmtDate(day.date)}</h2>
                        <p
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: '0.85rem',
                                marginTop: 'var(--space-1)',
                            }}
                        >
                            Priority {day.priority} ·{' '}
                            {day.isActive
                                ? `${day.students} of ${day.capacity} places taken · ${day.seatsLeft} left`
                                : (day.note ?? 'Closed — nobody is scheduled here')}
                        </p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>
                        Close
                    </button>
                </div>

                {day.byClassBand.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-5)' }}>
                        <span className="input-label">Classes sitting this day</span>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                            {day.byClassBand.map((b) => (
                                <span
                                    key={b.classBand}
                                    className="badge"
                                    style={{ fontSize: '0.8rem' }}
                                >
                                    Class {b.classBand}: {b.students}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Sitting</th>
                                <th>Places</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {day.sittings.map((s, i) => (
                                <tr key={s.slotId ?? s.timingId ?? i}>
                                    <td>
                                        <strong>
                                            {s.startTime && s.endTime
                                                ? `${s.startTime} – ${s.endTime}`
                                                : (s.label ?? 'One-off sitting')}
                                        </strong>
                                        {s.label && s.startTime && (
                                            <div
                                                className="text-muted"
                                                style={{ fontSize: '0.78rem' }}
                                            >
                                                {s.label}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '0.875rem' }}>
                                        {s.booked}/{s.capacity}
                                    </td>
                                    <td>
                                        <span
                                            className={`badge ${
                                                !s.isOpen
                                                    ? 'badge-muted'
                                                    : s.booked >= s.capacity
                                                      ? 'badge-danger'
                                                      : 'badge-success'
                                            }`}
                                        >
                                            {!s.isOpen
                                                ? 'Not opened yet'
                                                : s.booked >= s.capacity
                                                  ? 'Full'
                                                  : `${s.capacity - s.booked} left`}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p
                    style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        marginTop: 'var(--space-4)',
                    }}
                >
                    A sitting is opened the first time somebody is scheduled onto it. Top up its
                    seats, or move participants between sittings, on{' '}
                    <a href="/slots" style={{ color: 'var(--primary-400)' }}>
                        the scheduling page
                    </a>
                    .
                </p>
            </div>
        </div>
    );
}
