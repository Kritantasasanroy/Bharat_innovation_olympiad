'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import PayToUnlockBanner from '@/components/PayToUnlockBanner';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import ExamsMobile from './ExamsMobile';

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

interface ExamSectionSummary {
    id: string;
    title: string;
    sortOrder: number;
    _count?: { sectionQuestions: number };
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
    sections?: ExamSectionSummary[];
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
    NEEDS_SLOT: { pill: 'Being scheduled', tone: 'warn', cta: 'Awaiting your exam date' },
    SLOT_UPCOMING: { pill: 'Your sitting is coming up', tone: 'info', cta: 'View your sitting' },
    OPEN: { pill: 'Open now', tone: 'success', cta: 'Start Exam' },
    SLOT_MISSED: { pill: 'Schedule missed', tone: 'danger', cta: 'Schedule has passed' },
    ENDED: { pill: 'Closed', tone: 'muted', cta: 'Exam closed' },
};

export default function StudentExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Slot picking is gated on the pass, so the card CTA needs to know.
    const [hasPass, setHasPass] = useState<boolean | null>(null);
    useEffect(() => {
        api.get('/access-pass/me')
            .then((r) => setHasPass(Boolean(r.data.isActive)))
            // Leave it null rather than guessing: the picker and the booking
            // endpoint both still enforce it.
            .catch(() => {});
    }, []);

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

    const isMobile = useIsMobile();
    if (isMobile) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                <Navbar />
                <ExamsMobile exams={exams} loading={loading} hasPass={hasPass} />
            </AuthGuard>
        );
    }

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Navbar />
            <main className="container page-content animate-fade-in">
                <div className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
                    <h1>My Exams</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        Your upcoming and open exams. You can start an exam once your slot opens.
                    </p>
                </div>

                {/* Paywall prompt — hidden once the student has an active pass. */}
                <PayToUnlockBanner />

                {loading ? (
                    <div className="loading-container" style={{ minHeight: '300px' }}>
                        <div className="spinner" />
                    </div>
                ) : exams.length > 0 ? (
                    <div className="grid-3">
                        {exams.map((exam) => (
                            <ExamCard key={exam.id} exam={exam} router={router} hasPass={hasPass} />
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
    hasPass,
}: {
    exam: Exam;
    router: ReturnType<typeof useRouter>;
    /** null while the pass is still being read — don't guess either way. */
    hasPass: boolean | null;
}) {
    const isCompleted = exam.isCompleted ?? false;

    // The instance the student actually cares about: the one they can start, else
    // the next one coming up.
    const instance = exam.instances.find((i) => i.canStart) ?? exam.instances[0];
    const phase: Phase = instance?.phase ?? exam.phase ?? 'ENDED';
    const ui = PHASE_UI[phase] ?? PHASE_UI.ENDED;
    const slot = instance?.mySlot ?? null;

    const startable = !isCompleted && (instance?.canStart ?? false);

    /**
     * `NEEDS_SLOT` no longer means "go and pick one". Sittings are assigned
     * automatically from the student's registration date, so this phase means
     * the assignment has not landed yet — usually because the organisers have
     * not opened any sittings, or because every date in the student's window was
     * full and staff have to place them by hand. Either way it is something the
     * student waits on rather than something they do, so the card explains and
     * offers no action.
     */
    const awaitingSlot = !isCompleted && phase === 'NEEDS_SLOT';

    /**
     * Paying is a separate gate from the sitting. A student is scheduled from the
     * moment they register, but cannot start until the one-time payment is done,
     * so an unpaid student is pointed at `/unlock` regardless of their date.
     */
    const mustPayFirst = !isCompleted && hasPass === false && !startable;

    const sections = [...(exam.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const questionCount = sections.reduce(
        (sum, s) => sum + (s._count?.sectionQuestions ?? 0),
        0,
    );

    const handleCardAction = () => {
        if (mustPayFirst) {
            router.push('/unlock');
        } else if (startable) {
            router.push(`/exams/${exam.id}/instructions`);
        } else if (slot) {
            router.push(`/exams/${exam.id}/schedule`);
        }
    };

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
                    <span className="meta-label">Questions</span>
                    <span className="meta-value">{questionCount || '-'}</span>
                </div>
                <div className="meta-item">
                    <span className="meta-label">Total Marks</span>
                    <span className="meta-value">{exam.totalMarks}</span>
                </div>
            </div>

            {/* What the paper actually covers. The Olympiad paper is built from
                five named pillars and the student is going to sit them one at a
                time, so showing the shape up front beats a bare section count. */}
            {sections.length > 0 && (
                <div className="exam-sections">
                    <span className="meta-label">
                        {sections.length} section{sections.length === 1 ? '' : 's'}
                    </span>
                    <ul className="exam-section-list">
                        {sections.map((s) => (
                            <li key={s.id}>
                                <span className="exam-section-name">{s.title}</span>
                                {typeof s._count?.sectionQuestions === 'number' && (
                                    <span className="exam-section-qcount">
                                        {s._count.sectionQuestions}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* The exam's own window — what a "scheduled" exam is waiting for. */}
            {instance && (
                <div className="exam-schedule">
                    <span className="meta-label">Exam window</span>
                    <span>
                        {dt(instance.startsAt)} to {timeOnly(instance.endsAt)}
                    </span>
                </div>
            )}

            {/* The student's own sitting. This, not the exam window, is what enables
                Start — and it is assigned, not chosen, so nothing here is a control. */}
            {slot ? (
                <div className={`slot-card ${startable ? 'slot-card-live' : ''}`}>
                    <div className="slot-card-head">
                        <span className="meta-label">Your exam sitting</span>
                        {slot.label && <strong>{slot.label}</strong>}
                    </div>
                    <div className="slot-card-time">
                        {dt(slot.startsAt)} to {timeOnly(slot.endsAt)}
                    </div>
                    <p className="slot-note slot-note-muted">
                        This date was assigned to you when you registered. Contact support if you
                        need it changed.
                    </p>
                </div>
            ) : (
                awaitingSlot && (
                    <div className="slot-card">
                        <p className="slot-note slot-note-warn">
                            Your exam date has not been set yet. We schedule every participant
                            about two weeks after they register, and you will be told your date
                            by email and WhatsApp as soon as it is confirmed.
                        </p>
                    </div>
                )
            )}

            {/* Why the button is off, in the student's words. Suppressed while the
                sitting is still being assigned: the card above already says so in
                terms the student can act on, and "you need a confirmed schedule
                booking" underneath it only reads as a second, blunter refusal. */}
            {!isCompleted && !startable && !awaitingSlot && instance?.startBlockedReason && (
                <p className="slot-note slot-note-muted">{instance.startBlockedReason}</p>
            )}

            <div className="exam-footer">
                <button
                    className={`btn ${startable || mustPayFirst ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                        width: '100%',
                        cursor: startable || mustPayFirst || slot ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!startable && !mustPayFirst && !slot}
                    onClick={handleCardAction}
                >
                    {isCompleted
                        ? '✓ Completed'
                        : mustPayFirst
                          ? '🔒 Unlock your exams'
                          : ui.cta}
                </button>
            </div>
        </div>
    );
}
