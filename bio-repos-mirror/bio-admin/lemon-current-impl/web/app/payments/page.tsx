'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { FormEvent, useCallback, useEffect, useState } from 'react';

interface Payment {
    id: string;
    razorpayOrderId: string;
    razorpayPaymentId: string | null;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    coupon: { code: string; discountPct: number } | null;
    user: { id: string; email: string; firstName: string; lastName: string };
    booking: {
        id: string;
        status: string;
        slot: {
            label: string | null;
            startsAt: string;
            examInstance: { exam: { title: string } };
        };
    } | null;
}

interface Coupon {
    id: string;
    code: string;
    discountPct: number;
    maxUses: number;
    usedCount: number;
    expiresAt: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PAID: { bg: 'rgba(34,197,94,0.15)', text: 'var(--success-400)' },
    CREATED: { bg: 'rgba(245,158,11,0.15)', text: 'var(--warning-400)' },
    FAILED: { bg: 'rgba(239,68,68,0.15)', text: 'var(--danger-400)' },
    REFUNDED: { bg: 'rgba(99,102,241,0.15)', text: '#a5b4fc' },
};

function StatusBadge({ status }: { status: string }) {
    const { bg, text } = STATUS_COLORS[status] ?? { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)' };
    return (
        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: bg, color: text }}>
            {status}
        </span>
    );
}

function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export default function AdminPaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [refundingId, setRefundingId] = useState<string | null>(null);
    const [showCouponModal, setShowCouponModal] = useState(false);
    const [couponSubmitting, setCouponSubmitting] = useState(false);
    const [couponError, setCouponError] = useState('');
    const [couponForm, setCouponForm] = useState({ code: '', discountPct: 10, maxUses: 100, expiresAt: '' });

    const fetchPayments = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await api.get<Payment[]>('/admin/payments', {
                params: statusFilter ? { status: statusFilter } : undefined,
            });
            setPayments(data);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const fetchCoupons = useCallback(async () => {
        try {
            const { data } = await api.get<Coupon[]>('/admin/coupons');
            setCoupons(data);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        fetchPayments();
        fetchCoupons();
    }, [fetchPayments, fetchCoupons]);

    // Revenue summary
    const summary = payments.reduce(
        (acc, p) => {
            acc.total += p.status === 'PAID' ? p.amount : 0;
            acc[p.status as 'PAID' | 'CREATED' | 'FAILED' | 'REFUNDED'] =
                (acc[p.status as 'PAID' | 'CREATED' | 'FAILED' | 'REFUNDED'] ?? 0) + 1;
            return acc;
        },
        { total: 0, PAID: 0, CREATED: 0, FAILED: 0, REFUNDED: 0 } as Record<string, number>,
    );

    const filtered = payments.filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            p.user.email.toLowerCase().includes(q) ||
            `${p.user.firstName} ${p.user.lastName}`.toLowerCase().includes(q) ||
            (p.booking?.slot?.examInstance?.exam?.title ?? '').toLowerCase().includes(q) ||
            p.razorpayOrderId.toLowerCase().includes(q)
        );
    });

    const handleRefund = async (payment: Payment) => {
        if (!confirm(`Refund ₹${(payment.amount / 100).toLocaleString('en-IN')} to ${payment.user.firstName} ${payment.user.lastName}? This cannot be undone.`)) return;
        setRefundingId(payment.id);
        try {
            await api.post(`/admin/payments/${payment.id}/refund`);
            fetchPayments();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            alert(msg ?? 'Refund failed. Please try again.');
        } finally {
            setRefundingId(null);
        }
    };

    const handleCreateCoupon = async (e: FormEvent) => {
        e.preventDefault();
        setCouponSubmitting(true);
        setCouponError('');
        try {
            await api.post('/admin/coupons', {
                code: couponForm.code.toUpperCase(),
                discountPct: Number(couponForm.discountPct),
                maxUses: Number(couponForm.maxUses),
                ...(couponForm.expiresAt ? { expiresAt: new Date(couponForm.expiresAt).toISOString() } : {}),
            });
            setShowCouponModal(false);
            setCouponForm({ code: '', discountPct: 10, maxUses: 100, expiresAt: '' });
            fetchCoupons();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
            setCouponError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to create coupon.'));
        } finally {
            setCouponSubmitting(false);
        }
    };

    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <main className="container animate-fade-in" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}>
                {/* Header */}
                <div style={{ marginBottom: 'var(--space-8)' }}>
                    <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Payments & Revenue</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                        Monitor transactions, issue refunds, and manage coupon codes.
                    </p>
                </div>

                {/* Revenue Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
                    <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>Total Revenue</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 700, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            ₹{(summary.total / 100).toLocaleString('en-IN')}
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>from paid transactions</p>
                    </div>
                    <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>Paid</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success-400)' }}>{summary.PAID}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>successful payments</p>
                    </div>
                    <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>Pending</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--warning-400)' }}>{summary.CREATED}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>awaiting payment</p>
                    </div>
                    <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>Refunded</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#a5b4fc' }}>{summary.REFUNDED}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>transactions refunded</p>
                    </div>
                </div>

                {/* Payments Table */}
                <div style={{ marginBottom: 'var(--space-10)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, flex: 1 }}>Transactions</h2>
                        <input
                            className="form-input"
                            placeholder="Search by student, exam, order ID…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ maxWidth: 300 }}
                        />
                        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 160 }}>
                            <option value="">All Status</option>
                            <option value="PAID">Paid</option>
                            <option value="CREATED">Pending</option>
                            <option value="FAILED">Failed</option>
                            <option value="REFUNDED">Refunded</option>
                        </select>
                    </div>

                    <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                        {loading ? (
                            <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading payments…</div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>💳</div>
                                <p style={{ color: 'var(--text-secondary)' }}>No payments found.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                                            {['Student', 'Exam / Slot', 'Amount', 'Status', 'Coupon', 'Order ID', 'Date', 'Action'].map(h => (
                                                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(p => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                    <div style={{ fontWeight: 500 }}>{p.user.firstName} {p.user.lastName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{p.user.email}</div>
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', maxWidth: 200 }}>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {p.booking?.slot?.examInstance?.exam?.title ?? '—'}
                                                    </div>
                                                    {p.booking?.slot?.label && (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{p.booking.slot.label}</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                    ₹{(p.amount / 100).toLocaleString('en-IN')}
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                    <StatusBadge status={p.status} />
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.8rem' }}>
                                                    {p.coupon ? (
                                                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)', fontSize: '0.75rem' }}>
                                                            {p.coupon.code} ({p.coupon.discountPct}% off)
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {p.razorpayOrderId}
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {fmt(p.createdAt)}
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                    {p.status === 'PAID' && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)', border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap' }}
                                                            onClick={() => handleRefund(p)}
                                                            disabled={refundingId === p.id}
                                                        >
                                                            {refundingId === p.id ? 'Refunding…' : 'Refund'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Coupon Management */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Coupon Codes</h2>
                        <button className="btn btn-primary btn-sm" onClick={() => { setShowCouponModal(true); setCouponError(''); }}>
                            + Create Coupon
                        </button>
                    </div>
                    <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                        {coupons.length === 0 ? (
                            <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>🎟️</div>
                                <p style={{ color: 'var(--text-secondary)' }}>No coupons yet. Create one to offer discounts to students.</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                                        {['Code', 'Discount', 'Used / Max', 'Expires', 'Status'].map(h => (
                                            <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {coupons.map(c => {
                                        const isExpired = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
                                        const isExhausted = c.usedCount >= c.maxUses;
                                        const usePct = Math.min(100, (c.usedCount / c.maxUses) * 100);
                                        return (
                                            <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary-400)', fontSize: '0.95rem', letterSpacing: '0.05em' }}>
                                                        {c.code}
                                                    </span>
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--accent-400)' }}>
                                                    {c.discountPct}% off
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', minWidth: 180 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                                        <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                                                            <div style={{ width: `${usePct}%`, height: '100%', background: isExhausted ? 'var(--danger-500)' : 'var(--accent-400)', borderRadius: 'var(--radius-full)' }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                            {c.usedCount} / {c.maxUses}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.875rem', color: isExpired ? 'var(--danger-400)' : 'var(--text-secondary)' }}>
                                                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never'}
                                                </td>
                                                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                    {isExhausted ? (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-400)' }}>Exhausted</span>
                                                    ) : isExpired ? (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-400)' }}>Expired</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(34,197,94,0.15)', color: 'var(--success-400)' }}>Active</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Create Coupon Modal */}
                {showCouponModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)' }}>
                        <div className="glass-card" style={{ width: '100%', maxWidth: 440, padding: 'var(--space-8)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--space-6)' }}>Create Coupon Code</h2>
                            <form onSubmit={handleCreateCoupon} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Coupon Code *</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. OLYMPIAD20"
                                        value={couponForm.code}
                                        onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                                        required
                                        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                                    />
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>Uppercase letters and numbers only.</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Discount % *</label>
                                        <input
                                            type="number" className="form-input" min={1} max={100}
                                            value={couponForm.discountPct}
                                            onChange={e => setCouponForm(f => ({ ...f, discountPct: Number(e.target.value) }))}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Max Uses *</label>
                                        <input
                                            type="number" className="form-input" min={1}
                                            value={couponForm.maxUses}
                                            onChange={e => setCouponForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Expires At (optional)</label>
                                    <input
                                        type="datetime-local" className="form-input"
                                        value={couponForm.expiresAt}
                                        onChange={e => setCouponForm(f => ({ ...f, expiresAt: e.target.value }))}
                                    />
                                </div>
                                {couponForm.discountPct > 0 && couponForm.code && (
                                    <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(255,203,5,0.07)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,203,5,0.15)' }}>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Students using <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)', fontWeight: 600 }}>{couponForm.code || '…'}</span> will get {couponForm.discountPct}% off the exam fee.
                                        </p>
                                    </div>
                                )}
                                {couponError && <p style={{ color: 'var(--danger-400)', fontSize: '0.875rem' }}>{couponError}</p>}
                                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowCouponModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={couponSubmitting}>
                                        {couponSubmitting ? 'Creating…' : 'Create Coupon'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </AuthGuard>
    );
}
