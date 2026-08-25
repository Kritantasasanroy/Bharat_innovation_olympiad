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

interface Payout {
    id: string;
    partnerId: string;
    amountPaise: number;
    note: string | null;
    status: 'TRIGGERED' | 'PAID';
    triggeredBy: string;
    triggeredAt: string;
    paidBy: string | null;
    paidAt: string | null;
}

interface BankDetails {
    partnerId: string;
    accountHolderName: string;
    bankName: string;
    ifscCode: string;
    accountNumberLast4: string;
    panMasked: string;
    submittedAt: string;
    updatedAt: string;
    accountNumber?: string;
    pan?: string;
}

interface EngineSnapshot {
    partner: Partner;
    campaigns: Campaign[];
    funnel: Funnel;
    payouts: Payout[];
    bankDetails: BankDetails | null;
}

const STATUS_CLASS: Record<string, string> = {
    ACTIVE: 'badge badge-success',
    APPROVED: 'badge badge-success',
    INACTIVE: 'badge badge-muted',
    PENDING: 'badge badge-warning',
    TRIGGERED: 'badge badge-warning',
    PAID: 'badge badge-success',
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

    const [triggeringPayout, setTriggeringPayout] = useState(false);
    const [payoutAmount, setPayoutAmount] = useState('');
    const [payoutNote, setPayoutNote] = useState('');
    const [payoutSubmitting, setPayoutSubmitting] = useState(false);
    const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

    const [revealing, setRevealing] = useState(false);
    const [revealed, setRevealed] = useState<{ accountNumber: string; pan: string } | null>(null);

    const [editingIdentity, setEditingIdentity] = useState(false);
    const [identitySaving, setIdentitySaving] = useState(false);
    const [campaignActionId, setCampaignActionId] = useState<string | null>(null);

    useEffect(() => {
        void loadPartners();
    }, []);

    useEffect(() => {
        setRevealed(null);
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

    async function submitTriggerPayout(event: FormEvent) {
        event.preventDefault();
        if (!selectedPartnerId) return;
        const rupees = Number(payoutAmount);
        if (!rupees || rupees <= 0) return;
        setPayoutSubmitting(true);
        setError(null);
        setNotice(null);
        try {
            await api.post(`/admin/partners/${selectedPartnerId}/payouts`, {
                amountPaise: Math.round(rupees * 100),
                ...(payoutNote.trim() ? { note: payoutNote.trim() } : {}),
            });
            setTriggeringPayout(false);
            setPayoutAmount('');
            setPayoutNote('');
            setNotice({ type: 'success', message: 'Payout triggered — the partner can see it now.' });
            await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not trigger the payout.'));
        } finally {
            setPayoutSubmitting(false);
        }
    }

    async function markPaid(payout: Payout) {
        if (!selectedPartnerId) return;
        setMarkingPaidId(payout.id);
        setError(null);
        setNotice(null);
        try {
            await api.patch(`/admin/partners/${selectedPartnerId}/payouts/${payout.id}`, { status: 'PAID' });
            setNotice({ type: 'success', message: `${rupeesFromPaise(payout.amountPaise)} marked paid.` });
            await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not mark the payout paid.'));
        } finally {
            setMarkingPaidId(null);
        }
    }

    async function revealBankDetails() {
        if (!selectedPartnerId) return;
        setRevealing(true);
        setError(null);
        try {
            const { data } = await api.get<BankDetails>(
                `/admin/partners/${selectedPartnerId}/bank-details/reveal`,
            );
            if (data.accountNumber && data.pan) {
                setRevealed({ accountNumber: data.accountNumber, pan: data.pan });
            }
        } catch (err) {
            setError(apiMessage(err, 'Could not reveal bank details.'));
        } finally {
            setRevealing(false);
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
                        Inspect a partner&apos;s engine record: campaigns, conversion funnel, payouts, and
                        payout bank details.
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
                                <h2>Payouts</h2>
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => {
                                        setTriggeringPayout(true);
                                        setPayoutAmount('');
                                        setPayoutNote('');
                                    }}
                                >
                                    Trigger payout
                                </button>
                            </div>
                            <p className="text-muted" style={{ marginTop: 0 }}>
                                No fixed commission — pick the amount yourself. It shows on the partner&apos;s
                                dashboard the moment you trigger it, and the first one unlocks their bank-details
                                form.
                            </p>
                            {snapshot.payouts.length === 0 ? (
                                <p className="text-muted">No payouts yet.</p>
                            ) : (
                                <table className="data-table" style={{ margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Amount</th>
                                            <th>Note</th>
                                            <th>Status</th>
                                            <th>Triggered</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.payouts.map((p) => (
                                            <tr key={p.id}>
                                                <td>{rupeesFromPaise(p.amountPaise)}</td>
                                                <td>{p.note ?? '—'}</td>
                                                <td>
                                                    <span className={STATUS_CLASS[p.status] || 'badge badge-muted'}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td>{new Date(p.triggeredAt).toLocaleDateString('en-IN')}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {p.status === 'TRIGGERED' ? (
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            disabled={markingPaidId === p.id}
                                                            onClick={() => markPaid(p)}
                                                        >
                                                            {markingPaidId === p.id ? 'Saving…' : 'Mark paid'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-muted">Paid</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <h2>Bank details</h2>
                            {!snapshot.bankDetails ? (
                                <p className="text-muted">
                                    Not submitted yet — the partner sees the form once you trigger their first
                                    payout.
                                </p>
                            ) : (
                                <>
                                    <div className="access-card__grid">
                                        <div className="access-card__field">
                                            <dt>Account holder</dt>
                                            <dd>{snapshot.bankDetails.accountHolderName}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Bank</dt>
                                            <dd>{snapshot.bankDetails.bankName}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>IFSC</dt>
                                            <dd className="mono">{snapshot.bankDetails.ifscCode}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Account number</dt>
                                            <dd className="mono">
                                                {revealed ? revealed.accountNumber : snapshot.bankDetails.accountNumberLast4}
                                            </dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>PAN</dt>
                                            <dd className="mono">
                                                {revealed ? revealed.pan : snapshot.bankDetails.panMasked}
                                            </dd>
                                        </div>
                                    </div>
                                    {!revealed && (
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            style={{ marginTop: '0.75rem' }}
                                            disabled={revealing}
                                            onClick={revealBankDetails}
                                        >
                                            {revealing ? 'Revealing…' : 'Reveal full details'}
                                        </button>
                                    )}
                                    <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                        Revealing is logged against your account.
                                    </p>
                                </>
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

            {triggeringPayout && (
                <div className="modal-overlay" onClick={() => !payoutSubmitting && setTriggeringPayout(false)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>Trigger a payout</h2>
                        <p className="text-muted">
                            No fixed commission — pick the amount. It becomes visible to the partner immediately;
                            mark it paid once you&apos;ve actually sent the money.
                        </p>
                        <form className="exam-form" onSubmit={submitTriggerPayout}>
                            <div className="form-group">
                                <label htmlFor="payoutAmount">Amount (₹) *</label>
                                <input
                                    id="payoutAmount"
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    className="form-control"
                                    value={payoutAmount}
                                    onChange={(e) => setPayoutAmount(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="payoutNote">Note</label>
                                <input
                                    id="payoutNote"
                                    className="form-control"
                                    value={payoutNote}
                                    onChange={(e) => setPayoutNote(e.target.value)}
                                    placeholder="What this covers (optional)"
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setTriggeringPayout(false)}
                                    disabled={payoutSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={payoutSubmitting || !payoutAmount.trim()}
                                >
                                    {payoutSubmitting ? 'Triggering…' : 'Trigger payout'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
