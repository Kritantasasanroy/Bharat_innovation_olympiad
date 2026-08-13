'use client';

import PayToUnlockBanner from '@/components/PayToUnlockBanner';
import { useRouter } from 'next/navigation';

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
    new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const timeOnly = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const PHASE_UI: Record<Phase, { pill: string; tone: string; cta: string }> = {
    DRAFT: { pill: 'Unavailable', tone: 'muted', cta: 'Unavailable' },
    SCHEDULED: { pill: 'Scheduled', tone: 'info', cta: 'Not open yet' },
    NEEDS_SLOT: { pill: 'Choose your schedule', tone: 'warn', cta: 'Choose your exam schedule' },
    SLOT_UPCOMING: { pill: 'Your schedule is coming up', tone: 'info', cta: 'Waiting for your schedule' },
    OPEN: { pill: 'Open now', tone: 'success', cta: 'Start Exam' },
    SLOT_MISSED: { pill: 'Schedule missed', tone: 'danger', cta: 'Schedule has passed' },
    ENDED: { pill: 'Closed', tone: 'muted', cta: 'Exam closed' },
};

interface Props {
    exams: Exam[];
    loading: boolean;
    hasPass: boolean | null;
}

/**
 * The exam list, as its own mobile screen.
 *
 * Desktop's `ExamCard` (in `page.tsx`) already stacks to one column below
 * 768px via `.grid-3`, but it is styled for a `glass-card` sitting inside a
 * three-wide grid: dense meta rows and a `phase-pill` tuned to a card that
 * has room either side. This mirrors the same phase logic (mustPayFirst,
 * needsSlot, startable) against the `mob-card` visual language the rest of
 * the mobile screens use, so an exam card looks like it belongs on the same
 * phone as the dashboard.
 */
export default function ExamsMobile({ exams, loading, hasPass }: Props) {
    const router = useRouter();

    return (
        <main className="mob-page">
            <div className="mob-page__title">My Exams</div>
            <p className="mob-page__subtitle">Your upcoming and open exams.</p>

            <PayToUnlockBanner />

            {loading ? (
                <div className="loading-container" style={{ minHeight: '200px' }}><div className="spinner" /></div>
            ) : exams.length > 0 ? (
                exams.map((exam) => <MobileExamCard key={exam.id} exam={exam} router={router} hasPass={hasPass} />)
            ) : (
                <div className="mob-empty">
                    <div className="mob-empty__icon">📚</div>
                    <strong>No Exams Available</strong>
                    <p>There are no published exams for your class right now.</p>
                </div>
            )}
        </main>
    );
}

function MobileExamCard({ exam, router, hasPass }: { exam: Exam; router: ReturnType<typeof useRouter>; hasPass: boolean | null }) {
    const isCompleted = exam.isCompleted ?? false;
    const instance = exam.instances.find((i) => i.canStart) ?? exam.instances[0];
    const phase: Phase = instance?.phase ?? exam.phase ?? 'ENDED';
    const ui = PHASE_UI[phase] ?? PHASE_UI.ENDED;
    const slot = instance?.mySlot ?? null;
    const startable = !isCompleted && (instance?.canStart ?? false);
    const needsSlot = !isCompleted && phase === 'NEEDS_SLOT';
    const mustPayFirst = needsSlot && hasPass === false;

    const sections = [...(exam.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const questionCount = sections.reduce((sum, s) => sum + (s._count?.sectionQuestions ?? 0), 0);

    const handleCardAction = () => {
        if (mustPayFirst) router.push('/unlock');
        else if (needsSlot) router.push(`/exams/${exam.id}/slots`);
        else if (startable) router.push(`/exams/${exam.id}/instructions`);
    };

    return (
        <div className="mob-card mob-exam2" style={isCompleted ? { opacity: 0.6 } : {}}>
            <div className="mob-exam2__head">
                <h3>{exam.title}</h3>
                <span className={`phase-pill phase-${isCompleted ? 'muted' : ui.tone}`}>
                    {isCompleted ? 'Completed' : ui.pill}
                </span>
            </div>

            {exam.description && <p className="mob-exam2__desc">{exam.description}</p>}

            <div className="mob-exam2__meta">
                <span>{exam.durationMinutes} min</span>
                <span>{questionCount || '-'} questions</span>
                <span>{exam.totalMarks} marks</span>
            </div>

            {slot ? (
                <div className="mob-exam2__slot">
                    <span>Your schedule{slot.label ? ` · ${slot.label}` : ''}</span>
                    <strong>{dt(slot.startsAt)} - {timeOnly(slot.endsAt)}</strong>
                    {slot.bookingStatus === 'PENDING' && (
                        <p className="mob-exam2__warn">Not confirmed yet. Complete payment to secure this schedule.</p>
                    )}
                </div>
            ) : needsSlot ? (
                <p className="mob-exam2__warn">
                    {mustPayFirst
                        ? 'Unlock your exams first, then choose a date and time.'
                        : 'You have not picked a sitting yet. Places are limited.'}
                </p>
            ) : instance && (
                <div className="mob-exam2__slot">
                    <span>Exam window</span>
                    <strong>{dt(instance.startsAt)} - {timeOnly(instance.endsAt)}</strong>
                </div>
            )}

            {!isCompleted && !startable && !needsSlot && instance?.startBlockedReason && (
                <p className="mob-exam2__warn">{instance.startBlockedReason}</p>
            )}

            <button
                className={`btn ${startable || needsSlot ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: '100%', justifyContent: 'center', marginTop: '0.7rem' }}
                disabled={!startable && !needsSlot}
                onClick={handleCardAction}
            >
                {isCompleted ? '✓ Completed' : mustPayFirst ? '🔒 Unlock to pick your schedule' : ui.cta}
            </button>
        </div>
    );
}
