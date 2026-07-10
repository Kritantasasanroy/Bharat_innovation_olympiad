'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Kind = 'PARTNER' | 'SCHOOL';
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
type Decision = 'APPROVED' | 'REJECTED' | 'REVOKED';

/** As returned by `GET /admin/partner-requests`. */
interface PartnerRow {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    status: Status;
    decisionReason: string | null;
    createdAt: string;
    tokenIssuedAt: string | null;
    tokenLastUsedAt: string | null;
}

/** As returned by `GET /admin/school-requests`. */
interface SchoolRow {
    id: string;
    schoolName: string;
    board: string;
    udiseCode: string | null;
    pincode: string;
    city: string;
    state: string;
    coordinatorName: string;
    coordinatorEmail: string;
    coordinatorPhone: string;
    status: Status;
    submittedByPartnerId: string | null;
    decisionReason: string | null;
    createdAt: string;
    tokenIssuedAt: string | null;
    tokenLastUsedAt: string | null;
}

/** The two shapes flattened into what the shared queue actually renders. */
interface Row {
    kind: Kind;
    id: string;
    title: string;
    detail: string;
    contactName: string;
    email: string;
    phone: string;
    status: Status;
    decisionReason: string | null;
    createdAt: string;
    tokenIssuedAt: string | null;
    /** Set on a school a partner brought in; drives the "via partner" tag. */
    viaPartner: boolean;
}

interface Card {
    kind: Kind;
    id: string;
    status: Status;
    accessToken: string | null;
    tokenIssuedAt: string | null;
    tokenLastUsedAt: string | null;
    approvedAt: string | null;
    portalUrl: string;
    // Partner
    orgName?: string;
    contactPerson?: string;
    partnerId?: string | null;
    // School
    schoolName?: string;
    schoolCode?: string | null;
    board?: string;
    udiseCode?: string | null;
    pincode?: string;
    city?: string;
    state?: string;
    coordinatorName?: string;
    coordinatorEmail?: string;
    coordinatorPhone?: string;
    submittedByPartnerId?: string | null;
    email?: string;
    phone?: string;
}

const STATUS_CLASS: Record<Status, string> = {
    PENDING: 'badge badge-warning',
    APPROVED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
    REVOKED: 'badge badge-danger',
};

/** Which actions make sense from each status (the access state machine). */
function actionsFor(status: Status): Decision[] {
    switch (status) {
        case 'PENDING':
            return ['APPROVED', 'REJECTED'];
        case 'APPROVED':
            return ['REVOKED'];
        case 'REJECTED':
        case 'REVOKED':
            return ['APPROVED'];
    }
}

const ACTION_LABEL: Record<Decision, string> = {
    APPROVED: 'Grant access',
    REJECTED: 'Reject',
    REVOKED: 'Revoke access',
};

/** `/admin/partner-requests` vs `/admin/school-requests`. */
const basePath = (kind: Kind) => `/admin/${kind === 'PARTNER' ? 'partner' : 'school'}-requests`;

const toRow = {
    PARTNER: (r: PartnerRow): Row => ({
        kind: 'PARTNER',
        id: r.id,
        title: r.orgName,
        detail: 'Channel partner',
        contactName: r.contactPerson,
        email: r.email,
        phone: r.phone,
        status: r.status,
        decisionReason: r.decisionReason,
        createdAt: r.createdAt,
        tokenIssuedAt: r.tokenIssuedAt,
        viaPartner: false,
    }),
    SCHOOL: (r: SchoolRow): Row => ({
        kind: 'SCHOOL',
        id: r.id,
        title: r.schoolName,
        detail: `${r.board} · ${r.city}, ${r.state} · ${r.pincode}`,
        contactName: r.coordinatorName,
        email: r.coordinatorEmail,
        phone: r.coordinatorPhone,
        status: r.status,
        decisionReason: r.decisionReason,
        createdAt: r.createdAt,
        tokenIssuedAt: r.tokenIssuedAt,
        viaPartner: r.submittedByPartnerId !== null,
    }),
};

/** A plain-text block the admin can paste into an email or a WhatsApp message. */
function cardAsText(card: Card): string {
    const rows: [string, string | null | undefined][] =
        card.kind === 'SCHOOL'
            ? [
                  ['School', card.schoolName],
                  ['School code', card.schoolCode],
                  ['Board', card.board],
                  ['UDISE', card.udiseCode || '—'],
                  ['City', `${card.city}, ${card.state}`],
                  ['Pincode', card.pincode],
                  ['Coordinator', card.coordinatorName],
                  ['Email', card.coordinatorEmail],
                  ['Phone', card.coordinatorPhone],
              ]
            : [
                  ['Organisation', card.orgName],
                  ['Contact', card.contactPerson],
                  ['Email', card.email],
                  ['Phone', card.phone],
                  ['Partner ID', card.partnerId],
              ];

    const lines = rows.map(([label, value]) => `${label.padEnd(14)}${value ?? '—'}`);
    return [
        `Bharat Innovation Olympiad — ${card.kind === 'SCHOOL' ? 'School' : 'Partner'} access`,
        '',
        ...lines,
        '',
        `Portal        ${card.portalUrl}`,
        `Access token  ${card.accessToken ?? 'unavailable'}`,
        '',
        'This token is the credential for signing in. Do not share it further.',
    ].join('\n');
}

/**
 * Access Management — one review queue for every organisation asking to join:
 * channel partners and schools. Grant, reject, revoke or re-grant, then hand
 * over the access token on the card the backend issues at approval.
 *
 * Talks only to the legacy backend, which orchestrates: for partners it mirrors
 * the decision into the admin-api engine (`Partner.status`, the gate portal-api
 * checks per request); for schools it provisions the School row and coordinator
 * and deactivates them on revoke. Either way a revoke here takes effect on the
 * organisation's next request, not when their token expires.
 */
export default function AccessPage() {
    const [partners, setPartners] = useState<PartnerRow[]>([]);
    const [schools, setSchools] = useState<SchoolRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL');

    const [pending, setPending] = useState<{ row: Row; decision: Decision } | null>(null);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [card, setCard] = useState<Card | null>(null);
    const [cardBusy, setCardBusy] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [p, s] = await Promise.all([
                api.get<PartnerRow[]>('/admin/partner-requests'),
                api.get<SchoolRow[]>('/admin/school-requests'),
            ]);
            setPartners(p.data);
            setSchools(s.data);
        } catch {
            setError('Could not load access requests.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const rows = useMemo(() => {
        const merged = [...partners.map(toRow.PARTNER), ...schools.map(toRow.SCHOOL)];
        return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [partners, schools]);

    const visible = rows.filter(
        (r) =>
            (kindFilter === 'ALL' || r.kind === kindFilter) &&
            (statusFilter === 'ALL' || r.status === statusFilter),
    );
    const pendingCount = rows.filter((r) => r.status === 'PENDING').length;

    const openCard = useCallback(async (kind: Kind, id: string) => {
        setCardBusy(true);
        setRevealed(false);
        setError(null);
        try {
            const { data } = await api.get<Card>(`${basePath(kind)}/${id}/card`);
            setCard(data);
        } catch {
            setError('Could not load the access card.');
        } finally {
            setCardBusy(false);
        }
    }, []);

    async function submitDecision(event: FormEvent) {
        event.preventDefault();
        if (!pending || !reason.trim()) return;
        setSubmitting(true);
        setError(null);
        const { row, decision } = pending;
        try {
            await api.patch(`${basePath(row.kind)}/${row.id}`, { decision, reason: reason.trim() });
            setPending(null);
            setReason('');
            await load();
            // A fresh approval is exactly when staff need the token to hand over.
            if (decision === 'APPROVED') await openCard(row.kind, row.id);
        } catch {
            setError(
                row.kind === 'PARTNER' && decision !== 'REJECTED'
                    ? 'Could not reach the partner engine (admin-api). It may still be waking up — try again.'
                    : `Could not ${ACTION_LABEL[decision].toLowerCase()}.`,
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function rotate() {
        if (!card) return;
        setCardBusy(true);
        try {
            const { data } = await api.post<Card>(`${basePath(card.kind)}/${card.id}/rotate-token`);
            setCard(data);
            setRevealed(true);
            await load();
        } catch {
            setError('Could not rotate the token.');
        } finally {
            setCardBusy(false);
        }
    }

    async function copy(what: string, value: string) {
        await navigator.clipboard.writeText(value);
        setCopied(what);
        setTimeout(() => setCopied(null), 1800);
    }

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Access Requests</h1>
                    <p className="text-muted">
                        Partners and schools asking to join. Granting access issues a single access
                        token, shown on the handover card; revoking takes effect on their next request.
                    </p>
                </div>

                <div className="analytics-toolbar">
                    <div className="class-pills">
                        {(['ALL', 'PARTNER', 'SCHOOL'] as const).map((k) => (
                            <button
                                key={k}
                                className={`class-pill ${kindFilter === k ? 'active' : ''}`}
                                onClick={() => setKindFilter(k)}
                            >
                                {k === 'ALL' ? 'All types' : k === 'PARTNER' ? 'Partners' : 'Schools'}
                            </button>
                        ))}
                    </div>
                    <div className="class-pills">
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const).map((s) => (
                            <button
                                key={s}
                                className={`class-pill ${statusFilter === s ? 'active' : ''}`}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s === 'ALL' ? 'Any status' : s.charAt(0) + s.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                    <span className="stats-pill">
                        {pendingCount} awaiting review · {rows.length} total
                    </span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="glass-card table-responsive">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="empty-state">
                            <h3>No access requests</h3>
                            <p className="text-muted">
                                Partners apply from the partner portal&apos;s “Request access” page;
                                schools from the school portal&apos;s “Activate your school” page.
                            </p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Organisation</th>
                                    <th>Contact</th>
                                    <th>Requested</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((row) => (
                                    <tr key={`${row.kind}-${row.id}`}>
                                        <td>
                                            <span className={`kind-tag kind-tag--${row.kind.toLowerCase()}`}>
                                                {row.kind === 'PARTNER' ? 'Partner' : 'School'}
                                            </span>
                                            {row.viaPartner && (
                                                <span className="kind-tag kind-tag--partner" style={{ marginTop: '0.3rem', display: 'inline-block' }}>
                                                    via partner
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="student-name">
                                                <strong>{row.title}</strong>
                                                <span className="join-date">{row.detail}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="student-name">
                                                <span>{row.contactName}</span>
                                                <span className="join-date">{row.email}</span>
                                            </div>
                                        </td>
                                        <td className="text-muted">
                                            {new Date(row.createdAt).toLocaleDateString('en-IN', {
                                                dateStyle: 'medium',
                                            })}
                                        </td>
                                        <td>
                                            <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="row-actions">
                                                {row.tokenIssuedAt && (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => void openCard(row.kind, row.id)}
                                                    >
                                                        View card
                                                    </button>
                                                )}
                                                {actionsFor(row.status).map((decision) => (
                                                    <button
                                                        key={decision}
                                                        className={`btn btn-sm ${decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                                                        onClick={() => {
                                                            setPending({ row, decision });
                                                            setReason('');
                                                        }}
                                                    >
                                                        {ACTION_LABEL[decision]}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {pending && (
                <div className="modal-overlay" onClick={() => !submitting && setPending(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>{ACTION_LABEL[pending.decision]}</h2>
                        <p className="text-muted">
                            {pending.row.title} · {pending.row.email}
                        </p>
                        {pending.decision === 'APPROVED' && !pending.row.tokenIssuedAt && (
                            <p className="text-muted">
                                Approving issues this {pending.row.kind.toLowerCase()} a single access
                                token. You will see the handover card next.
                            </p>
                        )}
                        <form className="exam-form" onSubmit={submitDecision}>
                            <div className="form-group">
                                <label htmlFor="reason">Reason (required, recorded in the audit log)</label>
                                <textarea
                                    id="reason"
                                    className="form-control"
                                    rows={3}
                                    required
                                    autoFocus
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={
                                        pending.decision === 'APPROVED'
                                            ? 'e.g. Verified organisation; approved for the 2026 cycle.'
                                            : 'e.g. Duplicate application / policy violation.'
                                    }
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setPending(null)}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn ${pending.decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                                    disabled={submitting || !reason.trim()}
                                >
                                    {submitting ? 'Saving…' : ACTION_LABEL[pending.decision]}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {card && (
                <div className="modal-overlay" onClick={() => setCard(null)}>
                    <div className="modal-content glass-card access-card" onClick={(e) => e.stopPropagation()}>
                        <div className="access-card__head">
                            <span className={`kind-tag kind-tag--${card.kind.toLowerCase()}`}>
                                {card.kind === 'SCHOOL' ? 'School' : 'Partner'}
                            </span>
                            <h2>{card.kind === 'SCHOOL' ? card.schoolName : card.orgName}</h2>
                            <p className="text-muted">
                                Approved{' '}
                                {card.approvedAt
                                    ? new Date(card.approvedAt).toLocaleDateString('en-IN', {
                                          dateStyle: 'medium',
                                      })
                                    : '—'}
                            </p>
                        </div>

                        <dl className="access-card__grid">
                            {card.kind === 'SCHOOL' ? (
                                <>
                                    <Field label="School code" value={card.schoolCode} mono />
                                    <Field label="Board" value={card.board} />
                                    <Field label="UDISE" value={card.udiseCode || '—'} />
                                    <Field label="City" value={`${card.city}, ${card.state}`} />
                                    <Field label="Pincode" value={card.pincode} />
                                    <Field label="Coordinator" value={card.coordinatorName} />
                                    <Field label="Email" value={card.coordinatorEmail} />
                                    <Field label="Phone" value={card.coordinatorPhone} />
                                </>
                            ) : (
                                <>
                                    <Field label="Contact" value={card.contactPerson} />
                                    <Field label="Email" value={card.email} />
                                    <Field label="Phone" value={card.phone} />
                                    <Field label="Partner ID" value={card.partnerId} mono />
                                </>
                            )}
                            <Field label="Portal" value={card.portalUrl} />
                            <Field
                                label="Token last used"
                                value={
                                    card.tokenLastUsedAt
                                        ? new Date(card.tokenLastUsedAt).toLocaleString('en-IN')
                                        : 'Never'
                                }
                            />
                        </dl>

                        <div className="token-box">
                            <div className="token-box__label">
                                Access token
                                <span className="text-muted"> · one token, this {card.kind.toLowerCase()} only</span>
                            </div>
                            <code className="token-box__value">
                                {card.accessToken
                                    ? revealed
                                        ? card.accessToken
                                        : card.accessToken.replace(/[^-]/g, '•')
                                    : 'Unavailable — the sealing key changed. Rotate to issue a new token.'}
                            </code>
                            <div className="token-box__actions">
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => setRevealed((v) => !v)}
                                    disabled={!card.accessToken}
                                >
                                    {revealed ? 'Hide' : 'Reveal'}
                                </button>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => card.accessToken && void copy('token', card.accessToken)}
                                    disabled={!card.accessToken}
                                >
                                    {copied === 'token' ? 'Copied' : 'Copy token'}
                                </button>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => void copy('card', cardAsText(card))}
                                >
                                    {copied === 'card' ? 'Copied' : 'Copy full card'}
                                </button>
                                <button className="btn btn-sm btn-danger" onClick={rotate} disabled={cardBusy}>
                                    {cardBusy ? 'Working…' : 'Rotate'}
                                </button>
                            </div>
                            <p className="text-muted token-box__note">
                                Rotating invalidates the current token immediately. Anyone still holding
                                it is locked out.
                            </p>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setCard(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}

function Field({
    label,
    value,
    mono,
}: {
    label: string;
    value: string | null | undefined;
    mono?: boolean;
}) {
    return (
        <div className="access-card__field">
            <dt>{label}</dt>
            <dd className={mono ? 'mono' : undefined}>{value ?? '—'}</dd>
        </div>
    );
}
