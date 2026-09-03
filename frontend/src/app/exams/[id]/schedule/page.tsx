'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

/**
 * The student's exam sitting — a statement, not a choice.
 *
 * This page replaced a slot *picker*. Sittings are now assigned automatically
 * from the date a student registers (the first Sunday at least a fortnight out,
 * rolling forward as dates fill), so there is nothing here to select: the page's
 * whole job is to tell the student when their exam is, clearly enough that they
 * do not have to ask, and to say what happens next when it has not been set yet.
 *
 * `GET /my-schedule` re-runs the assignment before it answers, so a student who
 * registered before any sittings existed picks one up simply by opening this
 * page.
 */

interface Schedule {
    bookingId: string;
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
    slotId: string;
    label: string | null;
    startsAt: string;
    endsAt: string;
    weekday: string;
    exam: { id: string; title: string; durationMinutes: number };
    examInstanceId: string;
}

const IST = 'Asia/Kolkata';

function fullDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: IST,
    });
}

function timeOnly(iso: string) {
    return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: IST,
    });
}

/** Whole days until the sitting, counted in IST calendar days rather than 24h
 *  blocks — "in 3 days" should not become "in 2 days" because it is late. */
function daysUntil(iso: string): number {
    const dayOf = (d: Date) =>
        Math.floor((d.getTime() + 330 * 60_000) / 86_400_000);
    return dayOf(new Date(iso)) - dayOf(new Date());
}

function countdownLabel(iso: string): string {
    const days = daysUntil(iso);
    if (days < 0) return 'This sitting has passed';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
}

export default function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
    const { id: examId } = use(params);
    const router = useRouter();

    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [examTitle, setExamTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [scheduleRes, examRes] = await Promise.all([
                    api.get(`/my-schedule?examId=${examId}`),
                    api.get(`/exams/${examId}`).catch(() => ({ data: null })),
                ]);
                setSchedule(scheduleRes.data);
                setExamTitle(examRes.data?.title ?? scheduleRes.data?.exam?.title ?? 'Your exam');
            } catch (e: any) {
                setError(e.response?.data?.message || 'Could not load your exam schedule.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [examId]);

    if (loading) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '60vh',
                    }}
                >
                    <div className="spinner" />
                </div>
            </AuthGuard>
        );
    }

    const isPast = schedule ? daysUntil(schedule.startsAt) < 0 : false;

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <div style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem 1.5rem' }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: 0,
                    }}
                >
                    ← Back
                </button>

                <h1
                    style={{
                        fontSize: '1.6rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '0.35rem',
                    }}
                >
                    Your Exam Sitting
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem' }}>
                    {examTitle}
                </p>

                {error && (
                    <div
                        style={{
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '10px',
                            padding: '0.75rem 1rem',
                            color: 'var(--danger-400)',
                            fontSize: '0.9rem',
                            marginBottom: '1.25rem',
                        }}
                    >
                        {error}
                    </div>
                )}

                {schedule ? (
                    <>
                        {/* The date, given the weight it deserves — this is the one
                            fact the student came here for. */}
                        <div
                            style={{
                                background: isPast
                                    ? 'var(--bg-card)'
                                    : 'linear-gradient(135deg, rgba(125,200,50,0.12), rgba(255,203,5,0.08))',
                                border: isPast
                                    ? '1px solid var(--border-default)'
                                    : '1px solid rgba(125,200,50,0.4)',
                                borderRadius: '18px',
                                padding: '2rem 1.75rem',
                                marginBottom: '1.5rem',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '0.75rem',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: 'var(--text-secondary)',
                                    marginBottom: '0.75rem',
                                }}
                            >
                                {countdownLabel(schedule.startsAt)}
                            </div>

                            <div
                                style={{
                                    fontSize: '1.65rem',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    lineHeight: 1.25,
                                    marginBottom: '0.5rem',
                                }}
                            >
                                {fullDate(schedule.startsAt)}
                            </div>

                            <div
                                style={{
                                    fontSize: '1.1rem',
                                    fontWeight: 600,
                                    color: 'var(--accent-300)',
                                    marginBottom: '1rem',
                                }}
                            >
                                {timeOnly(schedule.startsAt)} – {timeOnly(schedule.endsAt)} IST
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    gap: '1.25rem',
                                    flexWrap: 'wrap',
                                    fontSize: '0.85rem',
                                    color: 'var(--text-secondary)',
                                    borderTop: '1px solid var(--border-subtle)',
                                    paddingTop: '1rem',
                                }}
                            >
                                <span>⏱ {schedule.exam.durationMinutes} minutes</span>
                                {schedule.label && <span>🏷 {schedule.label}</span>}
                            </div>
                        </div>

                        {/* Why they cannot change it, said once and plainly, rather
                            than as a refusal attached to a button that is not there. */}
                        <div
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '14px',
                                padding: '1.25rem 1.4rem',
                                marginBottom: '1.5rem',
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    marginBottom: '0.5rem',
                                    fontSize: '0.95rem',
                                }}
                            >
                                How this date was set
                            </div>
                            <p
                                style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.88rem',
                                    lineHeight: 1.6,
                                    margin: 0,
                                }}
                            >
                                Every participant is scheduled automatically when they register —
                                on the first available weekend sitting about two weeks later, so
                                you have time to prepare. Seats on each sitting are limited, which
                                is why dates differ between participants. If you genuinely cannot
                                make this date, contact support and the organisers can move you.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => router.push(`/exams/${examId}/instructions`)}
                                style={{ flex: '1 1 200px' }}
                            >
                                Exam instructions →
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => router.push(`/admit-card/${schedule.bookingId}`)}
                                style={{ flex: '1 1 200px' }}
                            >
                                View admit card
                            </button>
                        </div>
                    </>
                ) : (
                    <div
                        style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '16px',
                            padding: '3rem 2rem',
                            textAlign: 'center',
                        }}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</div>
                        <div
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '0.6rem',
                                fontSize: '1.05rem',
                            }}
                        >
                            Your exam date is being confirmed
                        </div>
                        <p
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: '0.9rem',
                                lineHeight: 1.6,
                                maxWidth: '400px',
                                margin: '0 auto',
                            }}
                        >
                            Participants are scheduled about two weeks after registering. Yours has
                            not been assigned yet — we will send it by email and WhatsApp as soon as
                            it is. There is nothing you need to do.
                        </p>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
