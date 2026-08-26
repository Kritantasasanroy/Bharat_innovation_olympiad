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

interface SchoolItem {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    pincode: string;
    board: string | null;
    udiseCode: string | null;
    partnerId: string | null;
    partnerName: string | null;
    onboardedAt: string | null;
    status: string;
    members: number;
    coordinator: {
        coordinatorName: string;
        coordinatorEmail: string;
        coordinatorPhone: string;
        status: string;
    } | null;
}

interface UserItem {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    classBand: number | null;
    schoolId: string | null;
    schoolName: string | null;
    onboardedBy?: 'SELF' | 'SCHOOL' | 'PARTNER';
    partnerName?: string | null;
    attempts: number;
    payments: number;
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

    const [activeTab, setActiveTab] = useState<'PARTNERS' | 'SCHOOLS' | 'ATTRIBUTION'>('PARTNERS');

    // Partners state
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

    // Schools & Attribution state
    const [schools, setSchools] = useState<SchoolItem[]>([]);
    const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
    const [schoolSnapshot, setSchoolSnapshot] = useState<{ payouts: Payout[]; bankDetails: BankDetails | null } | null>(null);
    const [schoolLoading, setSchoolLoading] = useState(false);
    const [triggeringSchoolPayout, setTriggeringSchoolPayout] = useState(false);
    const [schoolPayoutAmount, setSchoolPayoutAmount] = useState('');
    const [schoolPayoutNote, setSchoolPayoutNote] = useState('');
    const [schoolPayoutSubmitting, setSchoolPayoutSubmitting] = useState(false);

    // Platform Users for Attribution Breakdown
    const [allUsers, setAllUsers] = useState<UserItem[]>([]);

    useEffect(() => {
        void loadPartners();
        void loadSchools();
        void loadUsers();
    }, []);

    useEffect(() => {
        setRevealed(null);
        if (!selectedPartnerId) {
            setSnapshot(null);
            return;
        }
        void loadSnapshot(selectedPartnerId);
    }, [selectedPartnerId]);

    useEffect(() => {
        if (!selectedSchoolId) {
            setSchoolSnapshot(null);
            return;
        }
        void loadSchoolSnapshot(selectedSchoolId);
    }, [selectedSchoolId]);

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

    async function loadSchools() {
        try {
            const { data } = await api.get<SchoolItem[]>('/admin/manage/schools');
            setSchools(data);
        } catch {
            // silent
        }
    }

    async function loadUsers() {
        try {
            const { data } = await api.get<UserItem[]>('/admin/manage/users', { params: { role: 'STUDENT' } });
            setAllUsers(data);
        } catch {
            // silent
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

    async function loadSchoolSnapshot(schoolId: string) {
        setSchoolLoading(true);
        setError(null);
        setNotice(null);
        try {
            const { data } = await api.get<{ payouts: Payout[]; bankDetails: BankDetails | null }>(`/admin/schools/${schoolId}/payouts`);
            setSchoolSnapshot(data);
        } catch {
            // If endpoint returns error/empty, fallback to empty
            setSchoolSnapshot({ payouts: [], bankDetails: null });
        } finally {
            setSchoolLoading(false);
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

    async function submitTriggerSchoolPayout(event: FormEvent) {
        event.preventDefault();
        if (!selectedSchoolId) return;
        const rupees = Number(schoolPayoutAmount);
        if (!rupees || rupees <= 0) return;
        setSchoolPayoutSubmitting(true);
        setError(null);
        setNotice(null);
        try {
            await api.post(`/admin/schools/${selectedSchoolId}/payouts`, {
                amountPaise: Math.round(rupees * 100),
                ...(schoolPayoutNote.trim() ? { note: schoolPayoutNote.trim() } : {}),
            });
            setTriggeringSchoolPayout(false);
            setSchoolPayoutAmount('');
            setSchoolPayoutNote('');
            setNotice({ type: 'success', message: 'Payout triggered for school — the school coordinator can see it now.' });
            await loadSchoolSnapshot(selectedSchoolId);
        } catch (err) {
            setError(apiMessage(err, 'Could not trigger the school payout.'));
        } finally {
            setSchoolPayoutSubmitting(false);
        }
    }

    async function markPaid(payout: Payout) {
        if (!selectedPartnerId) return;
        setMarkingPaidId(payout.id);
        setError(null);
        setNotice(null);
        try {
            await api.patch(`/admin/partners/${selectedPartnerId}/payouts/${payout.id}`, { status: 'PAID' });
            setNotice({ type: 'success', message: 'Payout marked as paid.' });
            await loadSnapshot(selectedPartnerId);
        } catch (err) {
            setError(apiMessage(err, 'Could not mark the payout paid.'));
        } finally {
            setMarkingPaidId(null);
        }
    }

    async function markSchoolPaid(payout: Payout) {
        if (!selectedSchoolId) return;
        setMarkingPaidId(payout.id);
        setError(null);
        setNotice(null);
        try {
            await api.patch(`/admin/schools/${selectedSchoolId}/payouts/${payout.id}`, { status: 'PAID' });
            setNotice({ type: 'success', message: 'School payout marked as paid.' });
            await loadSchoolSnapshot(selectedSchoolId);
        } catch (err) {
            setError(apiMessage(err, 'Could not mark the school payout paid.'));
        } finally {
            setMarkingPaidId(null);
        }
    }

    async function revealBankDetails() {
        if (!selectedPartnerId) return;
        setRevealing(true);
        setError(null);
        try {
            const { data } = await api.get<{ accountNumber: string; pan: string }>(
                `/admin/partners/${selectedPartnerId}/bank-details/reveal`,
            );
            setRevealed(data);
            setNotice({ type: 'warn', message: 'Bank details revealed. This read was logged for audit.' });
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

    const selectedSchool = useMemo(
        () => schools.find((s) => s.id === selectedSchoolId) || null,
        [schools, selectedSchoolId],
    );

    // Attribution stats calculations
    const attributionMetrics = useMemo(() => {
        const selfStudents = allUsers.filter((u) => (u.onboardedBy ?? (u.schoolId ? 'SCHOOL' : 'SELF')) === 'SELF').length;
        const schoolStudents = allUsers.filter((u) => (u.onboardedBy ?? (u.schoolId ? 'SCHOOL' : 'SELF')) === 'SCHOOL').length;
        const partnerStudents = allUsers.filter((u) => u.onboardedBy === 'PARTNER').length;
        const partnerSchoolsCount = schools.filter((s) => s.partnerId !== null).length;

        return {
            totalStudents: allUsers.length,
            selfStudents,
            schoolStudents,
            partnerStudents,
            totalSchools: schools.length,
            partnerSchoolsCount,
        };
    }, [allUsers, schools]);

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <div className="page-content">
                <div className="page-header">
                    <h1>Payouts &amp; Attribution Hub</h1>
                    <p className="text-muted">
                        Manage Partner &amp; School payouts, track student onboarding attribution (Self vs School vs Partner), and view institutional conversions.
                    </p>
                </div>

                {/* ── Main Workspace Tabs ── */}
                <div className="analytics-toolbar" style={{ marginBottom: '1.5rem' }}>
                    <div className="class-pills">
                        <button
                            className={`class-pill ${activeTab === 'PARTNERS' ? 'active' : ''}`}
                            onClick={() => setActiveTab('PARTNERS')}
                        >
                            Partner Workspaces &amp; Payouts
                        </button>
                        <button
                            className={`class-pill ${activeTab === 'SCHOOLS' ? 'active' : ''}`}
                            onClick={() => setActiveTab('SCHOOLS')}
                        >
                            School Workspaces &amp; Payouts
                        </button>
                        <button
                            className={`class-pill ${activeTab === 'ATTRIBUTION' ? 'active' : ''}`}
                            onClick={() => setActiveTab('ATTRIBUTION')}
                        >
                            Onboarding &amp; Attribution Summary
                        </button>
                    </div>
                </div>

                {error && <div className="form-error">{error}</div>}
                {notice && (
                    <div className={notice.type === 'success' ? 'form-success' : 'form-warn'}>{notice.message}</div>
                )}

                {/* ══════════════════════════════════════════════════════════
                    TAB 1: PARTNER WORKSPACES & PAYOUTS
                   ══════════════════════════════════════════════════════════ */}
                {activeTab === 'PARTNERS' && (
                    <>
                        <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 280 }}>
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
                                    Export Partners CSV
                                </button>
                            </div>
                        </div>

                        {loading && (
                            <div className="loading-container">
                                <div className="spinner" />
                            </div>
                        )}

                        {!loading && snapshot && (
                            <>
                                <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <h2>Partner profile</h2>
                                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingIdentity(true)}>
                                            Edit identity
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
                                            <span className="stat-tile__label">Student Signups</span>
                                            <span className="stat-tile__value">{snapshot.funnel.signups}</span>
                                        </div>
                                        <div className="stat-tile">
                                            <span className="stat-tile__label">Registrations</span>
                                            <span className="stat-tile__value">{snapshot.funnel.registrations}</span>
                                        </div>
                                        <div className="stat-tile">
                                            <span className="stat-tile__label">Paid Pass Holders</span>
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
                                        <h2>Campaigns &amp; referral links</h2>
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
                                        <h2>Partner Payouts</h2>
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
                                        Admin decides the payout amount. It becomes visible on the partner&apos;s portal immediately.
                                    </p>
                                    {snapshot.payouts.length === 0 ? (
                                        <p className="text-muted">No payouts triggered for this partner yet.</p>
                                    ) : (
                                        <table className="data-table" style={{ margin: 0 }}>
                                            <thead>
                                                <tr>
                                                    <th>Amount</th>
                                                    <th>Note</th>
                                                    <th>Status</th>
                                                    <th>Triggered Date</th>
                                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {snapshot.payouts.map((p) => (
                                                    <tr key={p.id}>
                                                        <td><strong>{rupeesFromPaise(p.amountPaise)}</strong></td>
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
                                            Not submitted yet — the partner sees the form once you trigger their first payout.
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
                                        </>
                                    )}
                                </section>
                            </>
                        )}
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════
                    TAB 2: SCHOOL WORKSPACES & PAYOUTS
                   ══════════════════════════════════════════════════════════ */}
                {activeTab === 'SCHOOLS' && (
                    <>
                        <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 280 }}>
                                    <label htmlFor="schoolSelect">Select a registered school</label>
                                    {schools.length === 0 ? (
                                        <p className="text-muted">No schools found.</p>
                                    ) : (
                                        <select
                                            id="schoolSelect"
                                            className="form-control"
                                            value={selectedSchoolId ?? ''}
                                            onChange={(e) => setSelectedSchoolId(e.target.value || null)}
                                        >
                                            <option value="">Choose a school…</option>
                                            {schools.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} ({s.code}) — {s.city}, {s.state} · {s.members} students
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={schools.length === 0}
                                    onClick={() =>
                                        downloadCsv(
                                            'bio-schools-payouts.csv',
                                            ['School Name', 'Code', 'City', 'State', 'Students', 'Coordinator', 'Email'],
                                            schools.map((s) => [
                                                s.name,
                                                s.code,
                                                s.city,
                                                s.state,
                                                s.members,
                                                s.coordinator?.coordinatorName ?? '',
                                                s.coordinator?.coordinatorEmail ?? '',
                                            ]),
                                        )
                                    }
                                >
                                    Export Schools CSV
                                </button>
                            </div>
                        </div>

                        {schoolLoading && (
                            <div className="loading-container">
                                <div className="spinner" />
                            </div>
                        )}

                        {!schoolLoading && selectedSchool && (
                            <>
                                <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <h2>School Details &amp; Coordinator</h2>
                                    </div>
                                    <div className="access-card__grid">
                                        <div className="access-card__field">
                                            <dt>School Name</dt>
                                            <dd>{selectedSchool.name}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>School Code</dt>
                                            <dd className="mono">{selectedSchool.code}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Students Onboarded</dt>
                                            <dd>
                                                <span className="badge badge-success" style={{ fontWeight: 700 }}>
                                                    {selectedSchool.members} students
                                                </span>
                                            </dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Location</dt>
                                            <dd>{selectedSchool.city}, {selectedSchool.state} · {selectedSchool.pincode}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Coordinator Name</dt>
                                            <dd>{selectedSchool.coordinator?.coordinatorName || '—'}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Coordinator Email</dt>
                                            <dd>{selectedSchool.coordinator?.coordinatorEmail || '—'}</dd>
                                        </div>
                                        <div className="access-card__field">
                                            <dt>Affiliated Partner</dt>
                                            <dd>{selectedSchool.partnerName || 'Independent (House Partner)'}</dd>
                                        </div>
                                    </div>
                                </section>

                                <section className="glass-card" style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <h2>School Institutional Payouts</h2>
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => {
                                                setTriggeringSchoolPayout(true);
                                                setSchoolPayoutAmount('');
                                                setSchoolPayoutNote('');
                                            }}
                                        >
                                            Trigger School Payout
                                        </button>
                                    </div>
                                    <p className="text-muted" style={{ marginTop: 0 }}>
                                        Triggering a payout unlocks the Payouts tab on this school's portal for the coordinator to enter their bank details.
                                    </p>

                                    {(!schoolSnapshot?.payouts || schoolSnapshot.payouts.length === 0) ? (
                                        <p className="text-muted">No payouts triggered for this school yet.</p>
                                    ) : (
                                        <table className="data-table" style={{ margin: 0 }}>
                                            <thead>
                                                <tr>
                                                    <th>Amount</th>
                                                    <th>Note</th>
                                                    <th>Status</th>
                                                    <th>Triggered Date</th>
                                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {schoolSnapshot.payouts.map((p) => (
                                                    <tr key={p.id}>
                                                        <td><strong>{rupeesFromPaise(p.amountPaise)}</strong></td>
                                                        <td>{p.note ?? 'Institutional reward'}</td>
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
                                                                    onClick={() => markSchoolPaid(p)}
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
                                    <h2>School Bank Details</h2>
                                    {!schoolSnapshot?.bankDetails ? (
                                        <p className="text-muted">
                                            Not submitted yet — the school coordinator sees the bank details form once you trigger their first payout.
                                        </p>
                                    ) : (
                                        <div className="access-card__grid">
                                            <div className="access-card__field">
                                                <dt>Account holder</dt>
                                                <dd>{schoolSnapshot.bankDetails.accountHolderName}</dd>
                                            </div>
                                            <div className="access-card__field">
                                                <dt>Bank</dt>
                                                <dd>{schoolSnapshot.bankDetails.bankName}</dd>
                                            </div>
                                            <div className="access-card__field">
                                                <dt>IFSC</dt>
                                                <dd className="mono">{schoolSnapshot.bankDetails.ifscCode}</dd>
                                            </div>
                                            <div className="access-card__field">
                                                <dt>Account number</dt>
                                                <dd className="mono">••••••••{schoolSnapshot.bankDetails.accountNumberLast4}</dd>
                                            </div>
                                            <div className="access-card__field">
                                                <dt>PAN</dt>
                                                <dd className="mono">{schoolSnapshot.bankDetails.panMasked}</dd>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════
                    TAB 3: ONBOARDING & ATTRIBUTION SUMMARY (PRD / Requirement 7)
                   ══════════════════════════════════════════════════════════ */}
                {activeTab === 'ATTRIBUTION' && (
                    <>
                        <div className="stat-row" style={{ marginBottom: '1.5rem' }}>
                            <div className="stat-tile">
                                <span className="stat-tile__label">Total Registered Students</span>
                                <span className="stat-tile__value">{attributionMetrics.totalStudents}</span>
                            </div>
                            <div className="stat-tile">
                                <span className="stat-tile__label">Onboarded by Self (Direct)</span>
                                <span className="stat-tile__value" style={{ color: 'var(--primary-400)' }}>
                                    {attributionMetrics.selfStudents}
                                </span>
                            </div>
                            <div className="stat-tile">
                                <span className="stat-tile__label">Onboarded by Schools</span>
                                <span className="stat-tile__value" style={{ color: '#c084fc' }}>
                                    {attributionMetrics.schoolStudents}
                                </span>
                            </div>
                            <div className="stat-tile">
                                <span className="stat-tile__label">Onboarded by Partners</span>
                                <span className="stat-tile__value" style={{ color: '#60a5fa' }}>
                                    {attributionMetrics.partnerStudents}
                                </span>
                            </div>
                            <div className="stat-tile">
                                <span className="stat-tile__label">Schools via Partners</span>
                                <span className="stat-tile__value">
                                    {attributionMetrics.partnerSchoolsCount} / {attributionMetrics.totalSchools}
                                </span>
                            </div>
                        </div>

                        {/* Partner Onboarding Breakdown */}
                        <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                            <div className="section-title">
                                <h2>Partner Onboarding Performance</h2>
                                <span className="stats-pill">{partnerRequests.length} Partners</span>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Partner / Organisation</th>
                                        <th>Contact Person</th>
                                        <th>Schools Onboarded</th>
                                        <th>Direct Student Referrals</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partnerRequests.map((p) => {
                                        const partnerSchools = schools.filter((s) => s.partnerId === p.partnerId);
                                        const directStudents = allUsers.filter((u) => u.partnerName === p.orgName && u.onboardedBy === 'PARTNER');
                                        return (
                                            <tr key={p.id}>
                                                <td><strong>{p.orgName}</strong></td>
                                                <td>{p.contactPerson} ({p.email})</td>
                                                <td>
                                                    <span className="badge" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontWeight: 600 }}>
                                                        {partnerSchools.length} school{partnerSchools.length === 1 ? '' : 's'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 600 }}>
                                                        {directStudents.length} student{directStudents.length === 1 ? '' : 's'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={STATUS_CLASS[p.status] || 'badge badge-muted'}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => {
                                                            setSelectedPartnerId(p.partnerId);
                                                            setActiveTab('PARTNERS');
                                                        }}
                                                    >
                                                        Manage Partner
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* School Onboarding Breakdown */}
                        <div className="glass-card">
                            <div className="section-title">
                                <h2>School Cohort Breakdown</h2>
                                <span className="stats-pill">{schools.length} Schools</span>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>School Name</th>
                                        <th>Code</th>
                                        <th>City / State</th>
                                        <th>Attributed Partner</th>
                                        <th>Students Onboarded</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schools.map((s) => (
                                        <tr key={s.id}>
                                            <td><strong>{s.name}</strong></td>
                                            <td className="mono">{s.code}</td>
                                            <td className="text-muted">{s.city}, {s.state}</td>
                                            <td>
                                                {s.partnerName ? (
                                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 600 }}>
                                                        {s.partnerName}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">Independent</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className="badge badge-success" style={{ fontWeight: 700 }}>
                                                    {s.members} students
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => {
                                                        setSelectedSchoolId(s.id);
                                                        setActiveTab('SCHOOLS');
                                                    }}
                                                >
                                                    Manage Payouts
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Modal: Edit Partner Identity */}
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

            {/* Modal: Trigger Partner Payout */}
            {triggeringPayout && (
                <div className="modal-overlay" onClick={() => !payoutSubmitting && setTriggeringPayout(false)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>Trigger a Partner Payout</h2>
                        <p className="text-muted">
                            No fixed commission — pick the amount. It becomes visible to the partner immediately; mark it paid once sent.
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
                                <label htmlFor="payoutNote">Note / Description</label>
                                <input
                                    id="payoutNote"
                                    className="form-control"
                                    value={payoutNote}
                                    onChange={(e) => setPayoutNote(e.target.value)}
                                    placeholder="What this covers (e.g. Q3 Partner Campaign Reward)"
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
                                    {payoutSubmitting ? 'Triggering…' : 'Trigger Payout'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Trigger School Payout */}
            {triggeringSchoolPayout && (
                <div className="modal-overlay" onClick={() => !schoolPayoutSubmitting && setTriggeringSchoolPayout(false)}>
                    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                        <h2>Trigger a School Payout / Reward</h2>
                        <p className="text-muted">
                            Pick the amount for {selectedSchool?.name}. This activates the Payouts tab on the school's portal.
                        </p>
                        <form className="exam-form" onSubmit={submitTriggerSchoolPayout}>
                            <div className="form-group">
                                <label htmlFor="schoolPayoutAmount">Amount (₹) *</label>
                                <input
                                    id="schoolPayoutAmount"
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    className="form-control"
                                    value={schoolPayoutAmount}
                                    onChange={(e) => setSchoolPayoutAmount(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="schoolPayoutNote">Note / Description</label>
                                <input
                                    id="schoolPayoutNote"
                                    className="form-control"
                                    value={schoolPayoutNote}
                                    onChange={(e) => setSchoolPayoutNote(e.target.value)}
                                    placeholder="e.g. School Cohort Incentive Reward"
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setTriggeringSchoolPayout(false)}
                                    disabled={schoolPayoutSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={schoolPayoutSubmitting || !schoolPayoutAmount.trim()}
                                >
                                    {schoolPayoutSubmitting ? 'Triggering…' : 'Trigger School Payout'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthGuard>
    );
}
