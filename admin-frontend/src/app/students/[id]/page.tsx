'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Attempt {
    id: string;
    status: string;
    startedAt: string | null;
    submittedAt: string | null;
    totalScore: number | null;
    maxScore: number | null;
    riskScore: number | null;
    ipAddress: string | null;
    totalViolations: number;
    eventCounts: Record<string, number>;
    examInstance: {
        id: string;
        startsAt: string;
        endsAt: string;
        exam: { id: string; title: string; durationMinutes: number };
    };
}

interface Payment {
    id: string;
    razorpayOrderId: string;
    razorpayPaymentId: string | null;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    coupon: { code: string; discountPct: number } | null;
    booking: {
        id: string;
        status: string;
        slot: { label: string | null; startsAt: string; examInstance: { exam: { title: string } } };
    } | null;
}

interface Booking {
    id: string;
    status: string;
    createdAt: string;
    slot: { label: string | null; startsAt: string; endsAt: string; examInstance: { exam: { title: string } } };
}

/**
 * Registration part 2 — the parent's own details and the consent they gave.
 *
 * Two timestamps matter and they are different things: `approvalEmailSentAt` is
 * when the confirmation mail reached the parent, `parentalConsentAt` is when
 * they accepted. A consent with no send time means the mail never went out, and
 * that is worth being able to see rather than guess at.
 */
interface GuardianProfile {
    guardianFirstName: string;
    guardianLastName: string;
    relationship: string;
    guardianEmail: string;
    guardianPhone: string;
    studentDob: string | null;
    gender: string | null;
    city: string | null;
    state: string | null;
    idDocumentType: string | null;
    idDocumentUrl: string | null;
    parentalConsentAt: string | null;
    dataConsentAt: string | null;
    consentVersion: string;
    approvalEmailSentAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface StudentDetail {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    classBand: number | null;
    isActive: boolean;
    createdAt: string;
    faceEnrolled: boolean;
    school: { id: string; name: string; code: string; city: string; state: string } | null;
    guardianProfile: GuardianProfile | null;
    attempts: Attempt[];
    payments: Payment[];
    bookings: Booking[];
    summary: {
        totalAttempts: number;
        totalViolations: number;
        highestRiskScore: number;
        totalSpend: number;
        totalPayments: number;
    };
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PAID: { bg: 'rgba(34,197,94,0.15)', text: 'var(--success-400)' },
    CREATED: { bg: 'rgba(245,158,11,0.15)', text: 'var(--warning-400)' },
    FAILED: { bg: 'rgba(239,68,68,0.15)', text: 'var(--danger-400)' },
    REFUNDED: { bg: 'rgba(99,102,241,0.15)', text: '#a5b4fc' },
    SUBMITTED: { bg: 'rgba(34,197,94,0.15)', text: 'var(--success-400)' },
    AUTO_SUBMITTED: { bg: 'rgba(245,158,11,0.15)', text: 'var(--warning-400)' },
    IN_PROGRESS: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
    NOT_STARTED: { bg: 'var(--bg-elevated)', text: 'var(--text-tertiary)' },
    EXPIRED: { bg: 'rgba(239,68,68,0.15)', text: 'var(--danger-400)' },
    CONFIRMED: { bg: 'rgba(34,197,94,0.15)', text: 'var(--success-400)' },
    PENDING: { bg: 'rgba(245,158,11,0.15)', text: 'var(--warning-400)' },
    CANCELLED: { bg: 'rgba(239,68,68,0.15)', text: 'var(--danger-400)' },
};

function StatusBadge({ status }: { status: string }) {
    const { bg, text } = STATUS_COLORS[status] ?? { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)' };
    return (
        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: bg, color: text, whiteSpace: 'nowrap' }}>
            {status.replace('_', ' ')}
        </span>
    );
}

function fmt(dateStr: string | null) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function riskColor(score: number) {
    if (score >= 0.5) return 'var(--danger-400)';
    if (score >= 0.2) return 'var(--warning-400)';
    return 'var(--success-400)';
}

/** Date only — a date of birth with a 00:00 time on it reads as false precision. */
function fmtDate(dateStr: string | null) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </p>
            <p style={{ fontSize: '0.95rem', marginTop: '0.2rem', wordBreak: 'break-word' }}>{value}</p>
        </div>
    );
}

function GuardianDetails({ guardian }: { guardian: GuardianProfile }) {
    const name = `${guardian.guardianFirstName} ${guardian.guardianLastName}`.trim();

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-5)' }}>
                <Field label="Name" value={name || '—'} />
                <Field label="Relationship" value={guardian.relationship || '—'} />
                <Field label="Email" value={<a href={`mailto:${guardian.guardianEmail}`}>{guardian.guardianEmail}</a>} />
                <Field label="Phone" value={<a href={`tel:${guardian.guardianPhone}`}>{guardian.guardianPhone}</a>} />
                <Field label="Student date of birth" value={fmtDate(guardian.studentDob)} />
                <Field label="Gender" value={guardian.gender || '—'} />
                {(guardian.city || guardian.state) && (
                    <Field label="Location" value={[guardian.city, guardian.state].filter(Boolean).join(', ')} />
                )}
                <Field
                    label="ID document"
                    value={
                        guardian.idDocumentUrl ? (
                            <a href={guardian.idDocumentUrl} target="_blank" rel="noopener noreferrer">
                                {guardian.idDocumentType || 'View document'} ↗
                            </a>
                        ) : (
                            '—'
                        )
                    }
                />
            </div>

            {/* The consent trail. Kept visually separate from contact details —
                these are the timestamps that answer "was this child's parent
                actually told, and did they actually agree". */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: 'var(--space-5)',
                    marginTop: 'var(--space-6)',
                    paddingTop: 'var(--space-6)',
                    borderTop: '1px solid var(--border-default)',
                }}
            >
                <Field
                    label="Confirmation email sent"
                    value={
                        guardian.approvalEmailSentAt ? (
                            fmt(guardian.approvalEmailSentAt)
                        ) : (
                            // Not a failure of the consent — the mail is sent on a
                            // best-effort path that never blocks submission — but it
                            // does mean nobody wrote to this parent.
                            <span style={{ color: 'var(--warning-400)' }}>Not sent</span>
                        )
                    }
                />
                <Field
                    label="Parental consent accepted"
                    value={
                        guardian.parentalConsentAt ? (
                            <span style={{ color: 'var(--success-400)' }}>{fmt(guardian.parentalConsentAt)}</span>
                        ) : (
                            <span style={{ color: 'var(--danger-400)' }}>Not accepted</span>
                        )
                    }
                />
                <Field
                    label="Data-processing consent accepted"
                    value={
                        guardian.dataConsentAt ? (
                            <span style={{ color: 'var(--success-400)' }}>{fmt(guardian.dataConsentAt)}</span>
                        ) : (
                            <span style={{ color: 'var(--danger-400)' }}>Not accepted</span>
                        )
                    }
                />
                <Field label="Consent wording version" value={guardian.consentVersion} />
                <Field label="First submitted" value={fmt(guardian.createdAt)} />
                <Field label="Last updated" value={fmt(guardian.updatedAt)} />
            </div>
        </>
    );
}

export default function StudentDetailPage() {
    const params = useParams();
    const id = params?.id as string;

    const [student, setStudent] = useState<StudentDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        api.get<StudentDetail>(`/auth/admin/users/${id}`)
            .then((r) => setStudent(r.data))
            .catch((e) => setError(e.response?.data?.message ?? e.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <div className="loading-container" style={{ minHeight: '60vh' }}><div className="spinner" /></div>
            </AuthGuard>
        );
    }

    if (error || !student) {
        return (
            <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
                <Navbar />
                <main className="container page-content">
                    <div className="glass-card empty-state">
                        <h3 style={{ color: 'var(--danger-400)' }}>Student Not Found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
                        <Link href="/analytics" className="btn btn-secondary" style={{ marginTop: 'var(--space-4)', display: 'inline-block' }}>← Back to Students</Link>
                    </div>
                </main>
            </AuthGuard>
        );
    }

    const { summary } = student;

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)', maxWidth: '1100px' }}>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                    <Link href="/analytics" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textDecoration: 'none' }}>← Back to Students</Link>
                </div>

                {/* Header */}
                <div className="glass-card" style={{ padding: 'var(--space-8)', marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                        <div>
                            <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>{student.firstName} {student.lastName}</h1>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                {student.email}
                                {student.classBand && <> · Class {student.classBand}</>}
                                {student.school && <> · {student.school.name} ({student.school.city}, {student.school.state})</>}
                            </p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.4rem' }}>
                                Joined {fmt(student.createdAt)} · Role: {student.role} · Account {student.isActive ? 'Active' : 'Inactive'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <span style={{
                                fontSize: '0.75rem', fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-full)',
                                background: student.faceEnrolled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                color: student.faceEnrolled ? 'var(--success-400)' : 'var(--danger-400)',
                            }}>
                                {student.faceEnrolled ? '✓ Face Enrolled' : '✗ Face Not Enrolled'}
                            </span>
                        </div>
                    </div>

                    {/* Summary stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-6)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--border-default)' }}>
                        {[
                            { label: 'Attempts', value: summary.totalAttempts },
                            { label: 'Violations', value: summary.totalViolations, color: summary.totalViolations > 0 ? 'var(--warning-400)' : undefined },
                            { label: 'Highest Risk', value: `${Math.round(summary.highestRiskScore * 100)}%`, color: riskColor(summary.highestRiskScore) },
                            { label: 'Total Spend', value: `₹${(summary.totalSpend / 100).toLocaleString('en-IN')}`, color: 'var(--success-400)' },
                            { label: 'Payments', value: summary.totalPayments },
                        ].map((s) => (
                            <div key={s.label}>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                                <p style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color, marginTop: '0.2rem' }}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Parent / guardian — registration part 2 */}
                <div style={{ marginBottom: 'var(--space-8)' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Parent / Guardian</h2>
                    <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
                        {!student.guardianProfile ? (
                            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                No parent details on file. This student cannot start any exam — the
                                consent gate refuses every attempt until registration part 2 is done.
                            </p>
                        ) : (
                            <GuardianDetails guardian={student.guardianProfile} />
                        )}
                    </div>
                </div>

                {/* Exam attempts */}
                <div style={{ marginBottom: 'var(--space-8)' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Exam Attempts</h2>
                    <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                        {student.attempts.length === 0 ? (
                            <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>No exam attempts yet.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Exam</th>
                                            <th>Status</th>
                                            <th>Score</th>
                                            <th>Started</th>
                                            <th>Risk</th>
                                            <th>Violations</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.attempts.map((a) => (
                                            <tr key={a.id}>
                                                <td style={{ fontWeight: 500 }}>{a.examInstance.exam.title}</td>
                                                <td><StatusBadge status={a.status} /></td>
                                                <td>{a.totalScore != null ? `${a.totalScore} / ${a.maxScore}` : '—'}</td>
                                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{fmt(a.startedAt)}</td>
                                                <td style={{ color: riskColor(a.riskScore ?? 0), fontWeight: 700 }}>{Math.round((a.riskScore ?? 0) * 100)}%</td>
                                                <td>{a.totalViolations}</td>
                                                <td style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <Link href={`/proctor/${a.id}`} className="btn btn-sm btn-secondary" style={{ textDecoration: 'none' }}>Proctor</Link>
                                                    <Link href={`/analytics/attempt/${a.id}`} className="btn btn-sm btn-secondary" style={{ textDecoration: 'none' }}>Score</Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Payments */}
                <div style={{ marginBottom: 'var(--space-8)' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Payment History</h2>
                    <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                        {student.payments.length === 0 ? (
                            <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>No payments made yet.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Exam / Slot</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Coupon</th>
                                            <th>Order ID</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.payments.map((p) => (
                                            <tr key={p.id}>
                                                <td>{p.booking?.slot?.examInstance?.exam?.title ?? '—'}</td>
                                                <td style={{ fontWeight: 600 }}>₹{(p.amount / 100).toLocaleString('en-IN')}</td>
                                                <td><StatusBadge status={p.status} /></td>
                                                <td style={{ fontSize: '0.8rem' }}>{p.coupon ? `${p.coupon.code} (${p.coupon.discountPct}%)` : '—'}</td>
                                                <td style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{p.razorpayOrderId}</td>
                                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{fmt(p.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bookings */}
                <div>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Slot Bookings</h2>
                    <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                        {student.bookings.length === 0 ? (
                            <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>No slot bookings yet.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Exam</th>
                                            <th>Slot</th>
                                            <th>Status</th>
                                            <th>Booked On</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.bookings.map((b) => (
                                            <tr key={b.id}>
                                                <td>{b.slot.examInstance.exam.title}</td>
                                                <td style={{ fontSize: '0.85rem' }}>{b.slot.label ?? fmt(b.slot.startsAt)}</td>
                                                <td><StatusBadge status={b.status} /></td>
                                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{fmt(b.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}
