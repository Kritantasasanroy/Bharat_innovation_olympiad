'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * The student's exam list.
 *
 * It used to render a live "Start Exam" button on every exam it was handed — an
 * exam scheduled for next month looked exactly like one running right now, and
 * unpublished drafts appeared too. The backend now decides, per student, which
 * *phase* each exam is in, and this page renders that decision rather than
 * guessing from the dates.
 *
 * The two rules it exists to express:
 *  - a **scheduled** exam is visible but not startable (so a student can see
 *    what is coming and which slot they hold), and
 *  - an exam is startable only when the student's **own slot** is open — not
 *    merely when the exam window is.
 */

type Phase =
    | 'DRAFT'
    | 'SCHEDULED'
    | 'NEEDS_SLOT'
    | 'SLOT_UPCOMING'
    | 'OPEN'
    | 'SLOT_MISSED'
    | 'ENDED';

interface MySlot {
    bookingId: string;
    bookingStatus: string;
    slotId: string;
    label: string | null;
    startsAt: string;
    endsAt: string;
}

interface Instance {
    id: string;
    startsAt: string;
    endsAt: string;
    phase: Phase;
    canStart: boolean;
    startBlockedReason: string | null;
    mySlot: MySlot | null;
}

interface Exam {
    id: string;
    title: string;
    description: string | null;
    totalMarks: number;
    durationMinutes: number;
    phase: Phase;
    canStart: boolean;
    isCompleted?: boolean;
    instances: Instance[];
    _count?: { sections: number };
    sections?: unknown[];
}

const dt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

const timeOnly = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** How each phase presents itself: the pill, and what the button says. */
const PHASE_UI: Record<Phase, { pill: string; tone: string; cta: string }> = {
    DRAFT: { pill: 'Unavailable', tone: 'muted', cta: 'Unavailable' },
    SCHEDULED: { pill: 'Scheduled', tone: 'info', cta: 'Not open yet' },
    NEEDS_SLOT: { pill: 'Slot needed', tone: 'warn', cta: 'Book a slot' },
    SLOT_UPCOMING: { pill: 'Your slot is coming up', tone: 'info', cta: 'Waiting for your slot' },
    OPEN: { pill: 'Open now', tone: 'success', cta: 'Start Exam' },
    SLOT_MISSED: { pill: 'Slot missed', tone: 'danger', cta: 'Slot has passed' },
    ENDED: { pill: 'Closed', tone: 'muted', cta: 'Exam closed' },
};

export default function StudentExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchExams = async () => {
            try {
                // The backend filters by the student's classBand, drops anything
                // unpublished, and stamps each instance with its phase.
                const { data } = await api.get<Exam[]>(`/exams?t=${Date.now()}`);
                setExams(data);
            } catch (err) {
                console.error('Failed to fetch available exams', err);
            } finally {
                setLoading(false);
            }
        };
        fetchExams();

        // An exam goes live the moment its slot opens. Re-poll so the Start button
        // enables on its own, instead of the student having to guess and reload.
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void fetchExams();
        }, 30_000);
        return () => clearInterval(id);
    }, []);

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header" style={{ marginBottom: 'var(--space-8)' }}>
                    <h1>My Exams</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        Your upcoming and open exams. You can start an exam once your slot opens.
                    </p>
                </div>

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                    </div>
                ) : exams.length > 0 ? (
                    <div className="grid-3">
                        {exams.map((exam) => (
                            <ExamCard key={exam.id} exam={exam} router={router} />
                        ))}
                    </div>
                ) : (
                    <div className="glass-card empty-state">
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>📚</div>
                        <h3>No Exams Available</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            There are no published exams for your class right now. Once your school
                            or the organisers publish one, it will appear here with your slot.
                        </p>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}

function ExamCard({
    exam,
    router,
}: {
    exam: Exam;
    router: ReturnType<typeof useRouter>;
}) {
    const isCompleted = exam.isCompleted ?? false;

    // The instance the student actually cares about: the one they can start, else
    // the next one coming up.
    const instance = exam.instances.find((i) => i.canStart) ?? exam.instances[0];
    const phase: Phase = instance?.phase ?? exam.phase ?? 'ENDED';
    const ui = PHASE_UI[phase] ?? PHASE_UI.ENDED;
    const slot = instance?.mySlot ?? null;

    const startable = !isCompleted && (instance?.canStart ?? false);

    return (
        <div
            className="glass-card exam-card"
            style={isCompleted ? { filter: 'grayscale(1)', opacity: 0.7 } : {}}
        >
            <div className="exam-card-head">
                <h3>{exam.title}</h3>
                <span className={`phase-pill phase-${isCompleted ? 'muted' : ui.tone}`}>
                    {isCompleted ? 'Completed' : ui.pill}
                </span>
            </div>

            <p className="exam-desc">{exam.description || 'No description provided.'}</p>

            <div className="exam-meta">
                <div className="meta-item">
                    <span className="meta-label">Duration</span>
                    <span className="meta-value">{exam.durationMinutes} min</span>
                </div>
                <div className="meta-item">
                    <span className="meta-label">Total Marks</span>
                    <span className="meta-value">{exam.totalMarks}</span>
                </div>
                <div className="meta-item">
                    <span className="meta-label">Sections</span>
                    <span className="meta-value">
                        {exam.sections?.length || exam._count?.sections || 0}
                    </span>
                </div>
            </div>

            {/* The exam's own window — what a "scheduled" exam is waiting for. */}
            {instance && (
                <div className="exam-schedule">
                    <span className="meta-label">Exam window</span>
                    <span>
                        {dt(instance.startsAt)} — {timeOnly(instance.endsAt)}
                    </span>
                </div>
            )}

            {/* The student's own slot. This, not the exam window, is what enables Start. */}
            {slot ? (
                <div className={`slot-card ${startable ? 'slot-card-live' : ''}`}>
                    <div className="slot-card-head">
                        <span className="meta-label">Your slot</span>
                        {slot.label && <strong>{slot.label}</strong>}
                    </div>
                    <div className="slot-card-time">
                        {dt(slot.startsAt)} — {timeOnly(slot.endsAt)}
                    </div>
                    {slot.bookingStatus === 'PENDING' && (
                        <p className="slot-note slot-note-warn">
                            Your booking is not confirmed yet. Complete payment to secure this slot.
                        </p>
                    )}
                </div>
            ) : (
                phase === 'NEEDS_SLOT' && (
                    <div className="slot-card">
                        <p className="slot-note slot-note-warn">
                            You do not have a slot for this exam yet. Your school usually assigns one —
                            contact your coordinator if none appears.
                        </p>
                    </div>
                )
            )}

            {/* Why the button is off, in the student's words. */}
            {!isCompleted && !startable && instance?.startBlockedReason && (
                <p className="slot-note slot-note-muted">{instance.startBlockedReason}</p>
            )}

            <div className="exam-footer">
                <button
                    className={`btn ${startable ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ width: '100%', cursor: startable ? 'pointer' : 'not-allowed' }}
                    disabled={!startable}
                    onClick={() => startable && router.push(`/exams/${exam.id}/instructions`)}
                >
                    {isCompleted ? '✓ Completed' : ui.cta}
                </button>
            </div>
        </div>
    );
}
