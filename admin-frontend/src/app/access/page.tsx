'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    emailVerifiedAt: string | null;
    decisionReason: string | null;
    createdAt: string;
    decidedAt: string | null;
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
    emailVerifiedAt: string | null;
    submittedByPartnerId: string | null;
    /** Org name of the partner that onboarded this school, resolved server-side. */
    submittedByPartnerName: string | null;
    /** Campaign referral code the school arrived on, if any. */
    submittedViaReferralCode: string | null;
    decisionReason: string | null;
    createdAt: string;
    decidedAt: string | null;
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
    emailVerifiedAt: string | null;
    decisionReason: string | null;
    createdAt: string;
    decidedAt: string | null;
    tokenIssuedAt: string | null;
    tokenLastUsedAt: string | null;
    /** Set on a school a partner brought in; drives the "via partner" tag. */
    viaPartner: boolean;
    /** Org name of the onboarding partner (schools only), or null. */
    onboardedByPartner: string | null;
    /** Campaign referral code the request arrived on (schools only), or null. */
    referralCode: string | null;
    /** School-only address fields, surfaced in the detail view. */
    board: string | null;
    udiseCode: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
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

interface DecisionResponse {
    id: string;
    status: Status;
    partnerId?: string | null;
    schoolId?: string | null;
    emailSent: boolean;
}

type EmailNotice = { type: 'success' | 'warn'; message: string } | null;

const STATUS_CLASS: Record<Status, string> = {
    PENDING: 'badge badge-warning',
    APPROVED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
    REVOKED: 'badge badge-danger',
};

/** Which actions make sense from each status (the access state machine). */
function actionsFor(row: Row): Decision[] {
    if (row.status === 'PENDING' && !row.emailVerifiedAt) return [];
    switch (row.status) {
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

function responseStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
    const response = error.response;
    if (!response || typeof response !== 'object' || !('status' in response)) return undefined;
    return typeof response.status === 'number' ? response.status : undefined;
}

function responseMessage(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
    const response = error.response;
    if (!response || typeof response !== 'object' || !('data' in response)) return undefined;
    const data = (response as { data?: unknown }).data;
    if (!data || typeof data !== 'object' || !('message' in data)) return undefined;
    return typeof (data as { message?: unknown }).message === 'string'
        ? ((data as { message?: unknown }).message as string)
        : undefined;
}

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
        emailVerifiedAt: r.emailVerifiedAt,
        decisionReason: r.decisionReason,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        tokenIssuedAt: r.tokenIssuedAt,
        tokenLastUsedAt: r.tokenLastUsedAt,
        viaPartner: false,
        onboardedByPartner: null,
        referralCode: null,
        board: null,
        udiseCode: null,
        city: null,
        state: null,
        pincode: null,
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
        emailVerifiedAt: r.emailVerifiedAt,
        decisionReason: r.decisionReason,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        tokenIssuedAt: r.tokenIssuedAt,
        tokenLastUsedAt: r.tokenLastUsedAt,
        viaPartner: r.submittedByPartnerId !== null,
        onboardedByPartner: r.submittedByPartnerName,
        referralCode: r.submittedViaReferralCode,
        board: r.board,
        udiseCode: r.udiseCode,
        city: r.city,
        state: r.state,
        pincode: r.pincode,
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
    const [emailNotice, setEmailNotice] = useState<EmailNotice>(null);

    const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL');

    // The request whose full-detail card is open.
    const [detail, setDetail] = useState<Row | null>(null);

    const [pending, setPending] = useState<{ row: Row; decision: Decision } | null>(null);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [card, setCard] = useState<Card | null>(null);
    const [cardBusy, setCardBusy] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // Permanent delete
    const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleteReason, setDeleteReason] = useState('');
    const [deleting, setDeleting] = useState(false);

    // Pull the page (or the open modal) to whatever we just reported, so an
    // error or confirmation is never left sitting off-screen.
    const noticeRef = useRef<HTMLDivElement>(null);
    const modalNoticeRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!error && !emailNotice) return;
        const target = modalNoticeRef.current ?? noticeRef.current;
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [error, emailNotice]);

    // Open a request's detail card, clearing any notice left over from another row.
    const openDetail = useCallback((row: Row) => {
        setError(null);
        setEmailNotice(null);
        setDetail(row);
    }, []);

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const [p, s] = await Promise.all([
                api.get<PartnerRow[]>('/admin/partner-requests'),
                api.get<SchoolRow[]>('/admin/school-requests'),
            ]);
            setPartners(p.data);
            setSchools(s.data);
            setError(null);
        } catch {
            if (!background) setError('Could not load access requests.');
        } finally {
            if (!background) setLoading(false);
        }
    }, []);

    // Initial load + auto-refresh (background polls don't flash the spinner).
    useEffect(() => {
        void load();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void load(true);
        }, 12_000);
        return () => clearInterval(id);
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
    const pendingCount = rows.filter((r) => r.status === 'PENDING' && r.emailVerifiedAt).length;
    const verificationCount = rows.filter((r) => r.status === 'PENDING' && !r.emailVerifiedAt).length;

    // Keep the open detail card in step with background refreshes.
    const detailRow = detail
        ? (rows.find((r) => r.kind === detail.kind && r.id === detail.id) ?? detail)
        : null;

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

    /** Permanent-delete endpoint per kind: partner-request vs school-request. */
    const deletePath = (row: Row) =>
        row.kind === 'PARTNER' ? `/admin/manage/partners/${row.id}` : `/admin/manage/school-requests/${row.id}`;

    async function confirmDelete(event: FormEvent) {
        event.preventDefault();
        if (!deleteTarget || deleteConfirm.trim() !== deleteTarget.title) return;
        setDeleting(true);
        setError(null);
        try {
            await api.delete(deletePath(deleteTarget), {
                data: { reason: deleteReason.trim() || undefined },
            });
            setDeleteTarget(null);
            await load();
        } catch {
            setError('Could not delete this record.');
        } finally {
            setDeleting(false);
        }
    }

    async function submitDecision(event: FormEvent) {
        event.preventDefault();
        if (!pending || !reason.trim()) return;
        setSubmitting(true);
        setError(null);
        setEmailNotice(null);
        const { row, decision } = pending;
        try {
            const { data } = await api.patch<DecisionResponse>(`${basePath(row.kind)}/${row.id}`, {
                decision,
                reason: reason.trim(),
            });
            setPending(null);
            setReason('');
            await load();

            const action = decision === 'APPROVED' ? 'approved' : decision === 'REJECTED' ? 'rejected' : 'revoked';
            if (data.emailSent) {
                setEmailNotice({
                    type: 'success',
                    message: `${row.title} was ${action}. A notification email was sent to ${row.email}.`,
                });
            } else {
                setEmailNotice({
                    type: 'warn',
                    message: `${row.title} was ${action}, but the notification email could not be sent. Check the email provider configuration.`,
                });
            }

            // A fresh approval is exactly when staff need the token to hand over.
            if (decision === 'APPROVED') await openCard(row.kind, row.id);
        } catch (cause: unknown) {
            const backendMessage = responseMessage(cause);
            setError(
                backendMessage
                    ? `${ACTION_LABEL[decision]} failed: ${backendMessage}`
                    : row.kind === 'PARTNER' && decision !== 'REJECTED'
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
        setEmailNotice(null);
        try {
            const { data } = await api.post<Card & { emailSent: boolean }>(
                `${basePath(card.kind)}/${card.id}/rotate-token`,
            );
            const { emailSent, ...cardData } = data;
            setCard(cardData as Card);
            setRevealed(true);
            await load();

            if (emailSent) {
                setEmailNotice({
                    type: 'success',
                    message: `A new access token was issued and emailed to ${cardData.email ?? cardData.coordinatorEmail ?? 'the contact'}.`,
                });
            } else {
                setEmailNotice({
                    type: 'warn',
                    message: 'Token rotated, but the notification email could not be sent. Copy the token and hand it over manually.',
                });
            }
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

    async function resendEmail(kind: Kind, id: string, to: string) {
        setCardBusy(true);
        setEmailNotice(null);
        try {
            const { data } = await api.post<{ emailSent: boolean }>(`${basePath(kind)}/${id}/resend`);
            if (data.emailSent) {
                setEmailNotice({
                    type: 'success',
                    message: `Access details resent to ${to}.`,
                });
            } else {
                setEmailNotice({
                    type: 'warn',
                    message: 'Could not resend the access email. Copy the token from the card and send it manually.',
                });
            }
        } catch {
            setError('Could not resend the access email.');
        } finally {
            setCardBusy(false);
        }
    }

    const resend = (row: Row) => resendEmail(row.kind, row.id, row.email);

    async function resendVerification(row: Row) {
        setCardBusy(true);
        setEmailNotice(null);
        setError(null);
        try {
            const { data } = await api.post<{ emailSent: boolean }>(
                `${basePath(row.kind)}/${row.id}/resend-verification`,
            );
            setEmailNotice({
                type: data.emailSent ? 'success' : 'warn',
                message: data.emailSent
                    ? `A new activation link was sent to ${row.email}.`
                    : `The activation link could not be sent to ${row.email}. Check the email provider configuration.`,
            });
        } catch (cause: unknown) {
            const status = responseStatus(cause);
            const backendMessage = responseMessage(cause);
            setError(
                status === 429
                    ? 'A verification email was sent recently. Wait a minute before requesting another.'
                    : backendMessage
                      ? `Could not resend the activation link: ${backendMessage}`
                      : 'Could not resend the activation link.',
            );
        } finally {
            setCardBusy(false);
        }
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
                        {pendingCount} ready for review · {verificationCount} awaiting email · {rows.length} total
                    </span>
                </div>

                <div ref={noticeRef}>
                    {error && <div className="form-error">{error}</div>}
                    {emailNotice && (
                        <div className={emailNotice.type === 'success' ? 'form-success' : 'form-warn'}>
                            {emailNotice.message}
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="glass-card loading-container">
                        <div className="spinner" />
                    </div>
                ) : visible.length === 0 ? (
                    <div className="glass-card empty-state">
                        <h3>No access requests</h3>
                        <p className="text-muted">
                            Partners apply from the partner portal&apos;s “Request access” page;
                            schools from the school portal&apos;s “Activate your school” page.
                        </p>
                    </div>
                ) : (
                    <div className="request-grid">
                        {visible.map((row) => (
                            <div
                                key={`${row.kind}-${row.id}`}
                                className="request-card"
                                role="button"
                                tabIndex={0}
                                onClick={() => openDetail(row)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openDetail(row);
                                    }
                                }}
                            >
                                <div className="request-card__top">
                                    <span className="request-card__tags">
                                        <span className={`kind-tag kind-tag--${row.kind.toLowerCase()}`}>
                                            {row.kind === 'PARTNER' ? 'Partner' : 'School'}
                                        </span>
                                        {row.viaPartner && (
                                            <span className="kind-tag kind-tag--partner">via partner</span>
                                        )}
                                    </span>
                                    {row.status === 'PENDING' && !row.emailVerifiedAt ? (
                                        <span className="badge badge-warning">EMAIL UNVERIFIED</span>
                                    ) : (
                                        <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                                    )}
                                </div>

                                <div className="request-card__title">{row.title}</div>
                                <div className="request-card__detail">{row.detail}</div>

                                <dl className="request-card__facts">
                                    <div>
                                        <dt>Contact</dt>
                                        <dd>{row.contactName}</dd>
                                    </div>
                                    <div>
                                        <dt>Email</dt>
                                        <dd>{row.email}</dd>
                                    </div>
                                    <div>
                                        <dt>Phone</dt>
                                        <dd>{row.phone || '—'}</dd>
                                    </div>
                                    {row.kind === 'SCHOOL' && (
                                        <div>
                                            <dt>Onboarded by</dt>
                                            <dd>
                                                {row.onboardedByPartner ??
                                                    (row.viaPartner ? 'A partner' : 'Self-applied')}
                                            </dd>
                                        </div>
                                    )}
                                </dl>

                                <div className="request-card__foot">
                                    <span className="text-muted">
                                        Requested{' '}
                                        {new Date(row.createdAt).toLocaleDateString('en-IN', {
                                            dateStyle: 'medium',
                                        })}
                                    </span>
                                    {row.status === 'PENDING' ? (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            disabled={cardBusy}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void resendVerification(row);
                                            }}
                                        >
                                            Resend activation link
                                        </button>
                                    ) : (
                                        <span className="request-card__cue">View details →</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {detailRow && (
                <div className="modal-overlay" onClick={() => setDetail(null)}>
                    <div
                        className="modal-content glass-card access-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="access-card__head">
                            <span className="request-card__tags">
                                <span className={`kind-tag kind-tag--${detailRow.kind.toLowerCase()}`}>
                                    {detailRow.kind === 'PARTNER' ? 'Partner' : 'School'}
                                </span>
                                {detailRow.viaPartner && (
                                    <span className="kind-tag kind-tag--partner">via partner</span>
                                )}
                                {detailRow.status === 'PENDING' && !detailRow.emailVerifiedAt ? (
                                    <span className="badge badge-warning">EMAIL UNVERIFIED</span>
                                ) : (
                                    <span className={STATUS_CLASS[detailRow.status]}>{detailRow.status}</span>
                                )}
                            </span>
                            <h2>{detailRow.title}</h2>
                            <p className="text-muted">{detailRow.detail}</p>
                        </div>

                        {(error || emailNotice) && (
                            <div ref={modalNoticeRef}>
                                {error && <div className="form-error">{error}</div>}
                                {emailNotice && (
                                    <div
                                        className={
                                            emailNotice.type === 'success' ? 'form-success' : 'form-warn'
                                        }
                                    >
                                        {emailNotice.message}
                                    </div>
                                )}
                            </div>
                        )}

                        <dl className="access-card__grid">
                            <Field label="Contact" value={detailRow.contactName} />
                            <Field label="Email" value={detailRow.email} />
                            <Field label="Phone" value={detailRow.phone} />
                            {detailRow.kind === 'SCHOOL' && (
                                <>
                                    <Field label="Board" value={detailRow.board} />
                                    <Field label="UDISE" value={detailRow.udiseCode || '—'} />
                                    <Field label="City" value={detailRow.city} />
                                    <Field label="State" value={detailRow.state} />
                                    <Field label="Pincode" value={detailRow.pincode} />
                                    <Field
                                        label="Onboarded by"
                                        value={
                                            detailRow.onboardedByPartner ??
                                            (detailRow.viaPartner
                                                ? 'A partner'
                                                : 'Self-applied (no partner)')
                                        }
                                    />
                                    {detailRow.referralCode && (
                                        <Field
                                            label="Referral code"
                                            value={detailRow.referralCode}
                                            mono
                                        />
                                    )}
                                </>
                            )}
                            <Field
                                label="Requested"
                                value={new Date(detailRow.createdAt).toLocaleString('en-IN')}
                            />
                            <Field
                                label="Email verified"
                                value={
                                    detailRow.emailVerifiedAt
                                        ? new Date(detailRow.emailVerifiedAt).toLocaleString('en-IN')
                                        : 'Not verified'
                                }
                            />
                            {detailRow.tokenIssuedAt && (
                                <Field
                                    label="Token issued"
                                    value={new Date(detailRow.tokenIssuedAt).toLocaleString('en-IN')}
                                />
                            )}
                            {detailRow.tokenIssuedAt && (
                                <Field
                                    label="Token last used"
                                    value={
                                        detailRow.tokenLastUsedAt
                                            ? new Date(detailRow.tokenLastUsedAt).toLocaleString('en-IN')
                                            : 'Never'
                                    }
                                />
                            )}
                            {detailRow.decidedAt && (
                                <Field
                                    label="Decided"
                                    value={new Date(detailRow.decidedAt).toLocaleString('en-IN')}
                                />
                            )}
                            {detailRow.decisionReason && (
                                <Field label="Decision reason" value={detailRow.decisionReason} />
                            )}
                        </dl>

                        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                            {detailRow.status === 'PENDING' && (
                                <button
                                    className="btn btn-secondary"
                                    disabled={cardBusy}
                                    onClick={() => {
                                        if (!detailRow) return;
                                        void resendVerification(detailRow);
                                    }}
                                >
                                    {cardBusy ? 'Sending…' : 'Resend activation link'}
                                </button>
                            )}
                            {detailRow.tokenIssuedAt && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        if (!detailRow) return;
                                        const row = detailRow;
                                        setDetail(null);
                                        void openCard(row.kind, row.id);
                                    }}
                                >
                                    View handover card
                                </button>
                            )}
                            {detailRow.tokenIssuedAt && detailRow.status === 'APPROVED' && (
                                <button
                                    className="btn btn-secondary"
                                    disabled={cardBusy}
                                    onClick={() => {
                                        if (!detailRow) return;
                                        const row = detailRow;
                                        setDetail(null);
                                        void resend(row);
                                    }}
                                >
                                    Resend email
                                </button>
                            )}
                            {actionsFor(detailRow).map((decision) => (
                                <button
                                    key={decision}
                                    className={`btn ${decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                                    onClick={() => {
                                        if (!detailRow) return;
                                        const row = detailRow;
                                        setError(null);
                                        setEmailNotice(null);
                                        setDetail(null);
                                        setPending({ row, decision });
                                        setReason('');
                                    }}
                                >
                                    {ACTION_LABEL[decision]}
                                </button>
                            ))}
                            <button
                                className="btn btn-danger"
                                onClick={() => {
                                    if (!detailRow) return;
                                    const row = detailRow;
                                    setDetail(null);
                                    setDeleteTarget(row);
                                    setDeleteConfirm('');
                                    setDeleteReason('');
                                }}
                            >
                                Delete
                            </button>
                            <button className="btn btn-secondary" onClick={() => setDetail(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        {error && (
                            <div ref={modalNoticeRef} className="form-error">
                                {error}
                            </div>
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

            {deleteTarget && (
                <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>Permanently delete {deleteTarget.title}?</h2>
                        <p className="text-muted">
                            {deleteTarget.kind === 'SCHOOL'
                                ? 'This removes the school and its coordinator from the database and detaches its students (they keep their accounts). '
                                : 'This removes the partner and its access request from the database. '}
                            The record&apos;s contact details are archived (recoverable under Archive), but
                            this cannot be undone.
                        </p>
                        <form className="exam-form" onSubmit={confirmDelete}>
                            <div className="form-group">
                                <label>Reason (recorded in the archive + audit log)</label>
                                <input
                                    className="form-control"
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="e.g. Duplicate / test record"
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    Type <strong>{deleteTarget.title}</strong> to confirm
                                </label>
                                <input
                                    className="form-control"
                                    value={deleteConfirm}
                                    onChange={(e) => setDeleteConfirm(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setDeleteTarget(null)}
                                    disabled={deleting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-danger"
                                    disabled={deleting || deleteConfirm.trim() !== deleteTarget.title}
                                >
                                    {deleting ? 'Deleting…' : 'Delete permanently'}
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
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() =>
                                        resendEmail(card.kind, card.id, card.email ?? card.coordinatorEmail ?? '')
                                    }
                                    disabled={cardBusy}
                                >
                                    Resend email
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
