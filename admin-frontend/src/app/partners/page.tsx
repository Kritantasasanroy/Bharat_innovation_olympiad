'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { useAuth } from '@/hooks/useAuth';
import { FormEvent, useEffect, useMemo, useState } from 'react';

interface PartnerRequest {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    partnerId: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
}

interface Partner {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    commissionRatePct: number;
    status: string;
    createdAt: string;
}

interface Campaign {
    id: string;
    name: string;
    referralCode: string;
    linkToken: string;
    status: string;
    caps: { maxConversions?: number } | null;
    createdAt: string;
}

interface FunnelByCampaign {
    campaignId: string;
    campaignName: string;
    signups: number;
    registrations: number;
    paid: number;
}

interface Funnel {
    partnerId: string;
    signups: number;
    registrations: number;
    paid: number;
    byCampaign: FunnelByCampaign[];
}

interface CommissionLineItem {
    attributionId: string;
    campaignId: string;
    studentId: string;
    registrationId: string;
    amountPaise: number;
    commissionRatePct: number;
    commissionPaise: number;
}

interface Statement {
    id: string;
    period: string;
    version: number;
    lineItems: CommissionLineItem[];
    totalPaise: number;
    status: string;
    issuedAt: string;
}

interface Payout {
    id: string;
    partnerId: string;
    statementId: string;
    amountPaise: number;
    status: 'PENDING' | 'SIGNED_OFF' | 'RELEASED';
    financeSignOffApprover: string | null;
    financeSignOffAt: string | null;
    reason: string | null;
    createdAt: string;
}

interface EngineSnapshot {
    partner: Partner;
    campaigns: Campaign[];
    funnel: Funnel;
    statements: Statement[];
    payouts: Payout[];
}

const STATUS_CLASS: Record<string, string> = {
    ACTIVE: 'badge badge-success',
    APPROVED: 'badge badge-success',
    INACTIVE: 'badge badge-muted',
    PENDING: 'badge badge-warning',
    SIGNED_OFF: 'badge badge-success',
    RELEASED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
    REVOKED: 'badge badge-danger',
};

function rupeesFromPaise(paise: number): string {
    return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function apiMessage(err: unknown, fallback: string): string {
    const axiosError = err as { response?: { data?: { message?: string } } } | undefined;
    return axiosError?.response?.data?.message || fallback;
}

export default function PartnersPage() {
    const { user } = useAuth();

    const [partnerRequests, setPartnerRequests] = useState<PartnerRequest[]>([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'warn'; message: string } | null>(null);

    const [period, setPeriod] = useState('');
    const [generating, setGenerating] = useState(false);

    const [payoutAction, setPayoutAction] = useState<{
        payout: Payout;
        status: 'SIGNED_OFF' | 'RELEASED';
    } | null>(null);
    const [approver, setApprover] = useState('');
    const [payoutReason, setPayoutReason] = useState('');
    const [payoutSubmitting, setPayoutSubmitting] = useState(false);

    const [editingIdentity, setEditingIdentity] = useState(false);
    const [identitySaving, setIdentitySaving] = useState(false);
    const [campaignActionId, setCampaignActionId] = useState<string | null>(null);

    useEffect(() => {
        void loadPartners();
    }, []);

    useEffect(() => {
        if (!selectedPartnerId) {
            setSnapshot(null);
            return;
        }
        void loadSnapshot(selectedPartnerId);
    }, [selectedPartnerId]);

    async function loadPartners() {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get<PartnerRequest[]>('/admin/partner-requests');
            const approved = data.filter((p) => p.status === 'APPROVED' && p.partnerId);
            setPartnerRequests(approved);
        } catch {
            setError('Could not load the partner list.');
        } finally {
            setLoading(false);
        }
    }

    async function loadSnapshot(partnerId: string) {
        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            const { data } = await api.get<EngineSnapshot>(`/admin/partners/${partnerId}/engine`);
            setSnapshot(data);
        } catch (err) {
            setError(apiMessage(err, 'Could not load the partner workspace.'));
        } finally {
            setLoading(false);
        }
    }

    async function generateStatement(event: FormEvent) {
        event.preventDefault();
        if (!selectedPartnerId || !period.trim()) return;
        setGenerating(true);
        setError(null);
        setNotice(null);
        try {
            await api.post(`/admin/partners/${selectedPartnerId}/statements`, { period: period.trim() });
            setNotice({ type: 'success', message: `Statement for ${period.trim()} generated. Refreshing…` });
            setPeriod('');
            await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not generate the statement.'));
        } finally {
            setGenerating(false);
        }
    }

    async function submitPayoutStatus(event: FormEvent) {
        event.preventDefault();
        if (!payoutAction) return;
        setPayoutSubmitting(true);
        setError(null);
        setNotice(null);
        try {
            await api.patch(`/admin/payouts/${payoutAction.payout.id}/status`, {
                status: payoutAction.status,
                ...(approver.trim() ? { approver: approver.trim() } : {}),
                ...(payoutReason.trim() ? { reason: payoutReason.trim() } : {}),
            });
            setPayoutAction(null);
            setApprover('');
            setPayoutReason('');
            setNotice({
                type: 'success',
                message: `Payout advanced to ${payoutAction.status.replace('_', ' ')}.`,
            });
            if (selectedPartnerId) await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not update the payout.'));
        } finally {
            setPayoutSubmitting(false);
        }
    }

    async function saveIdentity(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedPartnerId) return;
        const form = new FormData(event.currentTarget);
        setIdentitySaving(true);
        setError(null);
        setNotice(null);
        try {
            await api.patch(`/admin/manage/partners/${selectedPartnerId}`, {
                orgName: String(form.get('orgName')),
                contactPerson: String(form.get('contactPerson')),
                email: String(form.get('email')),
                phone: String(form.get('phone')),
            });
            setEditingIdentity(false);
            setNotice({ type: 'success', message: 'Partner identity updated.' });
            await loadPartners();
            await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not update the partner.'));
        } finally {
            setIdentitySaving(false);
        }
    }

    async function toggleCampaign(campaign: Campaign) {
        if (!selectedPartnerId) return;
        const deactivate = campaign.status !== 'INACTIVE';
        setCampaignActionId(campaign.id);
        setError(null);
        setNotice(null);
        try {
            await api.patch(`/admin/partners/${selectedPartnerId}/campaigns/${campaign.id}`, { deactivate });
            setNotice({
                type: 'success',
                message: `Campaign "${campaign.name}" ${deactivate ? 'paused' : 'resumed'}.`,
            });
            await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not update the campaign.'));
        } finally {
            setCampaignActionId(null);
        }
    }

    const selectedPartner = useMemo(
        () => partnerRequests.find((p) => p.partnerId === selectedPartnerId) || null,
        [partnerRequests, selectedPartnerId],
    );

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Partner workspace</h1>
                    <p className="text-muted">
                        Inspect a partner&apos;s engine record: campaigns, conversion funnel, commission
                        statements, and payout ledger.
                    </p>
                </div>

                {error && <div className="form-error">{error}</div>}
                {notice && (
                    <div className={notice.type === 'success' ? 'form-success' : 'form-warn'}>{notice.message}</div>
                )}

                <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                            <label htmlFor="partner">Select an approved partner</label>
                            {partnerRequests.length === 0 && !loading ? (
                                <p className="text-muted">No approved partners yet. Approve a partner request first.</p>
                            ) : (
                                <select
                                    id="partner"
                                    className="form-control"
                                    value={selectedPartnerId ?? ''}
                                    onChange={(e) => setSelectedPartnerId(e.target.value || null)}
                                >
                                    <option value="">Choose a partner…</option>
                                    {partnerRequests.map((p) => (
                                        <option key={p.id} value={p.partnerId as string}>
                                            {p.orgName} — {p.contactPerson}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={partnerRequests.length === 0}
                            onClick={() =>
                                downloadCsv(
                                    'bio-partners.csv',
                                    ['Organisation', 'Contact', 'Email', 'Status'],
                                    partnerRequests.map((p) => [p.orgName, p.contactPerson, p.email, p.status]),
                                )
                            }
                        >
                            Export CSV
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                )}

                {snapshot && selectedPartner && (
                    <>
                        <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h2>Partner identity</h2>
                                <button className="btn btn-sm btn-secondary" onClick={() => setEditingIdentity(true)}>
                                    Edit
                                </button>
                            </div>
                            <div className="access-card__grid">
                                <div className="access-card__field">
                                    <dt>Organisation</dt>
                                    <dd>{snapshot.partner.orgName}</dd>
                                </div>
                                <div className="access-card__field">
                                    <dt>Contact</dt>
                                    <dd>{snapshot.partner.contactPerson}</dd>
                                </div>
                                <div className="access-card__field">
                                    <dt>Email</dt>
                                    <dd>{snapshot.partner.email}</dd>
                                </div>
                                <div className="access-card__field">
                                    <dt>Phone</dt>
                                    <dd>{snapshot.partner.phone}</dd>
                                </div>
                                <div className="access-card__field">
                                    <dt>Commission rate</dt>
                                    <dd>{snapshot.partner.commissionRatePct}%</dd>
                                </div>
                                <div className="access-card__field">
                                    <dt>Engine status</dt>
                                    <dd>
                                        <span className={STATUS_CLASS[snapshot.partner.status] || 'badge badge-muted'}>
                                            {snapshot.partner.status}
                                        </span>
                                    </dd>
                                </div>
                            </div>
                        </section>

                        <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <h2>Conversion funnel</h2>
                            <div className="stat-row" style={{ marginBottom: '1.25rem' }}>
                                <div className="stat-tile">
                                    <span className="stat-tile__label">Signups</span>
                                    <span className="stat-tile__value">{snapshot.funnel.signups}</span>
                                </div>
                                <div className="stat-tile">
                                    <span className="stat-tile__label">Registrations</span>
                                    <span className="stat-tile__value">{snapshot.funnel.registrations}</span>
                                </div>
                                <div className="stat-tile">
                                    <span className="stat-tile__label">Paid</span>
                                    <span className="stat-tile__value">{snapshot.funnel.paid}</span>
                                </div>
                            </div>
                            {snapshot.funnel.byCampaign.length === 0 ? (
                                <p className="text-muted">No campaign breakdown yet.</p>
                            ) : (
                                <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Campaign</th>
                                            <th>Signups</th>
                                            <th>Registrations</th>
                                            <th>Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.funnel.byCampaign.map((c) => (
                                            <tr key={c.campaignId}>
                                                <td>{c.campaignName}</td>
                                                <td>{c.signups}</td>
                                                <td>{c.registrations}</td>
                                                <td>{c.paid}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h2>Campaigns & referral links</h2>
                            </div>
                            {snapshot.campaigns.length === 0 ? (
                                <p className="text-muted">No campaigns for this partner yet.</p>
                            ) : (
                                <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Referral code</th>
                                            <th>Status</th>
                                            <th>Cap</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.campaigns.map((c) => (
                                            <tr key={c.id}>
                                                <td>{c.name}</td>
                                                <td className="mono">{c.referralCode}</td>
                                                <td>
                                                    <span className={STATUS_CLASS[c.status] || 'badge badge-muted'}>
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td>{c.caps?.maxConversions ?? '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className={c.status === 'INACTIVE' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-danger'}
                                                        disabled={campaignActionId === c.id}
                                                        onClick={() => toggleCampaign(c)}
                                                    >
                                                        {campaignActionId === c.id
                                                            ? 'Saving…'
                                                            : c.status === 'INACTIVE'
                                                              ? 'Resume'
                                                              : 'Pause'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h2>Commission statements</h2>
                                <form
                                    className="exam-form"
                                    onSubmit={generateStatement}
                                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                                >
                                    <input
                                        className="form-control"
                                        value={period}
                                        onChange={(e) => setPeriod(e.target.value)}
                                        placeholder="YYYY-MM"
                                        pattern="^\d{4}-(0[1-9]|1[0-2])$"
                                        title="Period in YYYY-MM form"
                                        style={{ width: 120 }}
                                    />
                                    <button
                                        type="submit"
                                        className="btn btn-sm btn-primary"
                                        disabled={generating || !period.trim()}
                                    >
                                        {generating ? 'Generating…' : 'Generate'}
                                    </button>
                                </form>
                            </div>
                            {snapshot.statements.length === 0 ? (
                                <p className="text-muted">No statements yet.</p>
                            ) : (
                                <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th>Version</th>
                                            <th>Total</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.statements.map((s) => (
                                            <tr key={s.id}>
                                                <td>{s.period}</td>
                                                <td>{s.version}</td>
                                                <td>{rupeesFromPaise(s.totalPaise)}</td>
                                                <td>
                                                    <span className={STATUS_CLASS[s.status] || 'badge badge-muted'}>
                                                        {s.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <h2>Payouts</h2>
                            {snapshot.payouts.length === 0 ? (
                                <p className="text-muted">No payout ledger entries yet.</p>
                            ) : (
                                <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Sign-off</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.payouts.map((p) => (
                                            <tr key={p.id}>
                                                <td>{rupeesFromPaise(p.amountPaise)}</td>
                                                <td>
                                                    <span className={STATUS_CLASS[p.status] || 'badge badge-muted'}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td>{p.financeSignOffApprover ?? '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {p.status === 'PENDING' && (
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => {
                                                                setPayoutAction({ payout: p, status: 'SIGNED_OFF' });
                                                                setApprover('');
                                                                setPayoutReason('');
                                                            }}
                                                        >
                                                            Sign off
                                                        </button>
                                                    )}
                                                    {p.status === 'SIGNED_OFF' && (
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => {
                                                                setPayoutAction({ payout: p, status: 'RELEASED' });
                                                                setApprover('');
                                                                setPayoutReason('');
                                                            }}
                                                        >
                                                            Release
                                                        </button>
                                                    )}
                                                    {p.status === 'RELEASED' && (
                                                        <span className="text-muted">Settled</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    </>
                )}
            </div>

            {editingIdentity && snapshot && (
                <div className="modal-overlay" onClick={() => !identitySaving && setEditingIdentity(false)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit partner identity</h2>
                        <p className="text-muted">
                            Staff can move a partner&apos;s login email; the partner itself cannot.
                        </p>
                        <form className="exam-form" onSubmit={saveIdentity}>
                            <div className="form-group">
                                <label htmlFor="orgName">Organisation</label>
                                <input
                                    id="orgName"
                                    name="orgName"
                                    className="form-control"
                                    defaultValue={snapshot.partner.orgName}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="contactPerson">Contact person</label>
                                <input
                                    id="contactPerson"
                                    name="contactPerson"
                                    className="form-control"
                                    defaultValue={snapshot.partner.contactPerson}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="email">Login email</label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    className="form-control"
                                    defaultValue={snapshot.partner.email}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="phone">Phone</label>
                                <input
                                    id="phone"
                                    name="phone"
                                    className="form-control"
                                    defaultValue={snapshot.partner.phone}
                                    required
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setEditingIdentity(false)}
                                    disabled={identitySaving}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={identitySaving}>
                                    {identitySaving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {payoutAction && (
                <div className="modal-overlay" onClick={() => !payoutSubmitting && setPayoutAction(null)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>
                            {payoutAction.status === 'SIGNED_OFF' ? 'Sign off payout' : 'Release payout'} —{' '}
                            {rupeesFromPaise(payoutAction.payout.amountPaise)}
                        </h2>
                        <p className="text-muted">
                            {payoutAction.status === 'SIGNED_OFF'
                                ? 'Records finance sign-off. Approver name is required.'
                                : 'Releases the signed-off payout. Add an optional reason.'}
                        </p>
                        <form className="exam-form" onSubmit={submitPayoutStatus}>
                            <div className="form-group">
                                <label htmlFor="approver">{payoutAction.status === 'SIGNED_OFF' ? 'Approver name *' : 'Approver / reference'}</label>
                                <input
                                    id="approver"
                                    className="form-control"
                                    value={approver}
                                    onChange={(e) => setApprover(e.target.value)}
                                    required={payoutAction.status === 'SIGNED_OFF'}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="payoutReason">Reason</label>
                                <input
                                    id="payoutReason"
                                    className="form-control"
                                    value={payoutReason}
                                    onChange={(e) => setPayoutReason(e.target.value)}
                                    placeholder="Optional note"
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setPayoutAction(null)}
                                    disabled={payoutSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={
                                        payoutSubmitting ||
                                        (payoutAction.status === 'SIGNED_OFF' && !approver.trim())
                                    }
                                >
                                    {payoutSubmitting ? 'Saving…' : 'Confirm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
