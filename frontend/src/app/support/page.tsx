'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import { api } from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

interface Grievance {
    id: string;
    type: 'GRIEVANCE' | 'REATTEMPT';
    subject: string;
    status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
    resolution: string | null;
    createdAt: string;
}

interface RefundRequest {
    id: string;
    reason: string;
    status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ISSUED';
    eligible: boolean;
    eligibilityNote: string | null;
    decisionReason: string | null;
    createdAt: string;
    payment: { amount: number; status: string; createdAt: string };
}

interface Payment {
    id: string;
    amount: number;
    status: string;
    createdAt: string;
}

interface Attempt {
    id: string;
    exam?: { title?: string };
    examTitle?: string;
}

const STATUS_CLASS: Record<string, string> = {
    OPEN: 'badge badge-warning',
    REQUESTED: 'badge badge-warning',
    IN_REVIEW: 'badge badge-warning',
    APPROVED: 'badge badge-success',
    RESOLVED: 'badge badge-success',
    ISSUED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
};

/** Student support: raise a grievance / re-attempt request, or ask for a refund. */
export default function SupportPage() {
    const [grievances, setGrievances] = useState<Grievance[]>([]);
    const [refunds, setRefunds] = useState<RefundRequest[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [gType, setGType] = useState<'GRIEVANCE' | 'REATTEMPT'>('GRIEVANCE');
    /** Uploaded proof: object keys from `POST /grievances/attachment`, with the
     *  original filename kept only so the student can see what they attached. */
    const [gFiles, setGFiles] = useState<{ url: string; name: string }[]>([]);
    const [uploading, setUploading] = useState(false);
    const [gSubject, setGSubject] = useState('');
    const [gDescription, setGDescription] = useState('');
    const [gAttemptId, setGAttemptId] = useState('');

    const [rPaymentId, setRPaymentId] = useState('');
    const [rReason, setRReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [g, r, p, a] = await Promise.all([
                api.get<Grievance[]>('/grievances/me'),
                api.get<RefundRequest[]>('/refunds/me'),
                api.get<Payment[]>('/payments/my-payments').catch(() => ({ data: [] as Payment[] })),
                api.get<Attempt[]>('/attempts/recent').catch(() => ({ data: [] as Attempt[] })),
            ]);
            setGrievances(g.data);
            setRefunds(r.data);
            setPayments(p.data.filter((x) => x.status === 'PAID'));
            setAttempts(a.data ?? []);
        } catch {
            setError('Could not load your support requests.');
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function uploadProof(file: File) {
        setUploading(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const { data } = await api.post<{ url: string }>('/grievances/attachment', form);
            setGFiles((prev) => [...prev, { url: data.url, name: file.name }]);
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'Could not upload that file. Try again.');
        } finally {
            setUploading(false);
        }
    }

    async function submitGrievance(event: FormEvent) {
        event.preventDefault();
        if (gFiles.length === 0) {
            setError('Attach at least one supporting document before submitting.');
            return;
        }
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await api.post('/grievances', {
                type: gType,
                subject: gSubject,
                description: gDescription,
                attachmentUrls: gFiles.map((f) => f.url),
                ...(gAttemptId ? { attemptId: gAttemptId } : {}),
            });
            setGSubject('');
            setGDescription('');
            setGAttemptId('');
            setGFiles([]);
            setNotice('Your request has been submitted. Our team will get back to you.');
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'Could not submit your request.');
        } finally {
            setBusy(false);
        }
    }

    async function submitRefund(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const { data } = await api.post<RefundRequest>('/refunds', {
                paymentId: rPaymentId,
                reason: rReason,
            });
            setRPaymentId('');
            setRReason('');
            setNotice(
                data.eligible
                    ? 'Refund requested. It looks eligible and is now with our team.'
                    : `Refund requested, but it may not be eligible: ${data.eligibilityNote}`,
            );
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.message ?? 'Could not submit your refund request.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthGuard>
            <Navbar />
            <div className="page-content" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '900px', margin: '0 auto' }}>
                <div className="page-header">
                    <h1>Support</h1>
                    <p className="text-muted">
                        Raise a grievance. Our team reviews every request and records a written decision.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}
                {notice && (
                    <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                        {notice}
                    </div>
                )}

                {/* ── Grievance ── */}
                <div className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
                    <h2>Raise a Grievance</h2>
                    <form className="exam-form" onSubmit={submitGrievance}>
                        <div className="form-group">
                            <label htmlFor="gattempt">Related attempt (optional)</label>
                            <select
                                id="gattempt"
                                className="form-control"
                                value={gAttemptId}
                                onChange={(e) => setGAttemptId(e.target.value)}
                            >
                                <option value="">(none)</option>
                                {attempts.map((attempt) => (
                                    <option key={attempt.id} value={attempt.id}>
                                        {attempt.examTitle ?? attempt.exam?.title ?? attempt.id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="gsubject">Subject</label>
                            <input
                                id="gsubject"
                                className="form-control"
                                required
                                value={gSubject}
                                onChange={(e) => setGSubject(e.target.value)}
                                placeholder="e.g. Technical issue during exam"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="gdesc">What happened?</label>
                            <textarea
                                id="gdesc"
                                className="form-control"
                                rows={4}
                                required
                                value={gDescription}
                                onChange={(e) => setGDescription(e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="gproof">
                                Supporting documents <span style={{ color: 'var(--danger-400)' }}>*</span>
                            </label>
                            <div className="support-proof-note">
                                <strong>Please attach sufficient proof.</strong> A request we cannot verify
                                cannot be decided, and chasing the document afterwards is what makes these
                                slow. If you are asking to <strong>change your exam date</strong>, give a
                                reasonable cause with an appropriate document — for example a{' '}
                                <em>medical prescription</em>, a <em>travel ticket</em>, or a{' '}
                                <em>ceremony/wedding card</em>. JPG, PNG, HEIC or PDF, up to 10&nbsp;MB each.
                            </div>
                            <input
                                id="gproof"
                                type="file"
                                className="form-control"
                                accept="image/jpeg,image/png,image/heic,application/pdf"
                                disabled={uploading || busy}
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void uploadProof(f);
                                    e.target.value = '';
                                }}
                            />
                            {uploading && <div className="text-secondary" style={{ fontSize: '0.8rem', marginTop: 4 }}>Uploading…</div>}
                            {gFiles.length > 0 && (
                                <ul className="support-proof-list">
                                    {gFiles.map((f, i) => (
                                        <li key={f.url}>
                                            <span>📎 {f.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setGFiles((prev) => prev.filter((_, j) => j !== i))}
                                                aria-label={`Remove ${f.name}`}
                                            >
                                                ✕
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={busy || uploading || gFiles.length === 0}>
                            {busy ? 'Submitting…' : 'Submit grievance'}
                        </button>
                    </form>
                </div>

                {/* ── History ── */}
                <div className="glass-card table-responsive">
                    <h2 style={{ padding: 'var(--space-4) var(--space-5) 0' }}>Your grievances</h2>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Status</th>
                                <th>Outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grievances.map((g) => (
                                <tr key={g.id}>
                                    <td>{g.subject}</td>
                                    <td>
                                        <span className={STATUS_CLASS[g.status] ?? 'badge'}>{g.status}</span>
                                    </td>
                                    <td className="text-muted">{g.resolution ?? '-'}</td>
                                </tr>
                            ))}
                            {grievances.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="text-muted">
                                        You have not raised any grievances yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AuthGuard>
    );
}
