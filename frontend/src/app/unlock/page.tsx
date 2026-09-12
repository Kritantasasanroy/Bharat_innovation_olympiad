'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import UnlockMobile from './UnlockMobile';

declare global {
    interface Window {
        Razorpay: any;
    }
}

interface AccessPass {
    status: 'PENDING' | 'ACTIVE' | 'REVOKED' | null;
    isActive: boolean;
    amount: number;
    grantedAt: string | null;
}

interface OrderResponse {
    alreadyActive: boolean;
    orderId?: string;
    amount?: number;
    currency?: string;
    key?: string;
}

// A brief poll after the checkout `handler` fires, purely to cover the gap
// between our own write landing and the next read seeing it.
const CONFIRM_POLLS = 10;
const CONFIRM_POLL_MS = 2000;

const BENEFITS = [
    'Sit every published olympiad exam this season, no per-exam fee',
    'Unlimited practice attempts on the practice Innovation Olympiad exam',
    'Full score reports and rank breakdown after each exam',
    'Downloadable certificates for every exam you complete',
];

export default function UnlockPage() {
    const user = useAuthStore((s) => s.user);
    const [pass, setPass] = useState<AccessPass | null>(null);
    const [loading, setLoading] = useState(true);
    const [payLoading, setPayLoading] = useState(false);
    const [error, setError] = useState('');
    const [claimOpen, setClaimOpen] = useState(false);
    const [claimPaymentId, setClaimPaymentId] = useState('');
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimSent, setClaimSent] = useState(false);
    const scriptReady = useRef(false);
    const confirmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadPass = useCallback(async () => {
        const res = await api.get<AccessPass>('/access-pass/me');
        setPass(res.data);
        if (res.data.isActive) {
            // The roll number (and the sitting behind it) are issued the
            // moment payment activates the pass, not at account creation — so
            // the cached user still shows neither until refreshed. Whatever
            // this student opens next (the dashboard included) reads the same
            // store, so this is the one place that has to pull it.
            void useAuthStore.getState().loadUser();
        }
        return res.data;
    }, []);

    const stopConfirmPoll = useCallback(() => {
        if (confirmPollRef.current) {
            clearInterval(confirmPollRef.current);
            confirmPollRef.current = null;
        }
    }, []);

    useEffect(() => {
        loadPass()
            .catch((e: any) =>
                setError(e.response?.data?.message || 'Could not load your access status.'),
            )
            .finally(() => setLoading(false));
        return () => stopConfirmPoll();
    }, [loadPass, stopConfirmPoll]);

    const confirmAfterHandler = useCallback(() => {
        let ticks = 0;
        stopConfirmPoll();
        confirmPollRef.current = setInterval(async () => {
            ticks += 1;
            try {
                const p = await loadPass();
                if (p.isActive) {
                    stopConfirmPoll();
                    return;
                }
            } catch {
                // Transient — keep polling.
            }
            if (ticks >= CONFIRM_POLLS) stopConfirmPoll();
        }, CONFIRM_POLL_MS);
    }, [loadPass, stopConfirmPoll]);

    /**
     * Razorpay Checkout opens as a modal on this page — no hosted payment page
     * to redirect to. Its `handler` fires synchronously with a payment id and
     * signature, which goes straight to `/access-pass/verify`. The order this
     * creates and the pass it activates are the same student's by construction
     * (the order is created from this student's own session), so there is
     * nothing left to match by email the way the old shared-link flow had to.
     */
    const openCheckout = useCallback(
        (order: Required<Pick<OrderResponse, 'orderId' | 'amount' | 'currency' | 'key'>>) => {
            const rzp = new window.Razorpay({
                key: order.key,
                amount: order.amount,
                currency: order.currency,
                name: 'Bharat Innovation Olympiad',
                description: 'Exam access pass',
                order_id: order.orderId,
                prefill: { email: user?.email },
                theme: { color: '#ffcb05' },
                handler: async (response: {
                    razorpay_order_id: string;
                    razorpay_payment_id: string;
                    razorpay_signature: string;
                }) => {
                    try {
                        await api.post('/access-pass/verify', {
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                        });
                        await loadPass();
                    } catch {
                        setError(
                            'Payment received — confirming it now. If this takes more than a minute, use "Already paid but still locked?" below.',
                        );
                        confirmAfterHandler();
                    } finally {
                        setPayLoading(false);
                    }
                },
                modal: {
                    ondismiss: () => setPayLoading(false),
                },
            });
            rzp.on('payment.failed', (resp: { error?: { description?: string } }) => {
                setPayLoading(false);
                setError(`Payment failed: ${resp.error?.description || 'please try again'}`);
            });
            rzp.open();
        },
        [user?.email, loadPass, confirmAfterHandler],
    );

    const handlePay = async () => {
        setError('');
        setPayLoading(true);
        try {
            const { data } = await api.post<OrderResponse>('/access-pass/create-order');
            if (data.alreadyActive) {
                await loadPass();
                setPayLoading(false);
                return;
            }
            if (!scriptReady.current || !window.Razorpay) {
                setError('Payment could not start — please refresh the page and try again.');
                setPayLoading(false);
                return;
            }
            openCheckout(data as Required<OrderResponse>);
        } catch (e: any) {
            setError(e.response?.data?.message || 'Could not start the payment.');
            setPayLoading(false);
        }
    };

    const handleClaim = async () => {
        if (!claimPaymentId.trim()) return;
        setClaimBusy(true);
        setError('');
        try {
            await api.post('/grievances', {
                type: 'GRIEVANCE',
                subject: 'Paid but account still locked',
                description:
                    `Access-pass payment not reflected in the account.\n` +
                    `Razorpay payment id: ${claimPaymentId.trim()}\n` +
                    `Account email: ${user?.email ?? ''}\n` +
                    `\nPlease verify the payment and grant the access pass.`,
            });
            setClaimSent(true);
        } catch {
            setError(
                'Could not send that automatically. Please email the payment id to support, your payment is safe.',
            );
        } finally {
            setClaimBusy(false);
        }
    };

    const rupees = ((pass?.amount ?? 100) / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    const razorpayScript = (
        <Script
            src="https://checkout.razorpay.com/v1/checkout.js"
            onLoad={() => {
                scriptReady.current = true;
            }}
        />
    );

    const isMobile = useIsMobile();
    if (isMobile) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                {razorpayScript}
                <UnlockMobile
                    loading={loading}
                    pass={pass}
                    payLoading={payLoading}
                    error={error}
                    rupees={rupees}
                    claimOpen={claimOpen}
                    claimPaymentId={claimPaymentId}
                    claimBusy={claimBusy}
                    claimSent={claimSent}
                    benefits={BENEFITS}
                    onPay={handlePay}
                    onOpenClaim={() => setClaimOpen(true)}
                    onClaimPaymentIdChange={setClaimPaymentId}
                    onClaim={handleClaim}
                />
            </AuthGuard>
        );
    }

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            {razorpayScript}
            <div style={{ maxWidth: '640px', margin: '0 auto', padding: 'var(--space-6, 1.5rem)' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', minHeight: '50vh', alignItems: 'center' }}>
                        <div className="spinner" />
                    </div>
                ) : pass?.isActive ? (
                    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '0.75rem' }}>✓</div>
                        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Your exams are unlocked</h1>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            You have full access to every olympiad exam this season. There is nothing more to pay.
                        </p>
                        <Link href="/exams" className="btn btn-primary btn-lg">
                            Browse Exams →
                        </Link>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '2rem' }}>
                        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.35rem' }}>Unlock this season&apos;s exams</h1>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            A single payment gives you access to every Bharat Innovation Olympiad exam
                            for the current season.
                        </p>

                        <div
                            style={{
                                display: 'flex', alignItems: 'baseline', gap: '0.5rem',
                                padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem',
                                background: 'var(--bg-tertiary, rgba(127,127,127,0.1))',
                            }}
                        >
                            <span style={{ fontSize: '2.25rem', fontWeight: 700 }}>₹{rupees}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>one-time · valid for this season</span>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
                            {BENEFITS.map((b) => (
                                <li
                                    key={b}
                                    style={{
                                        display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                                        marginBottom: '0.6rem', color: 'var(--text-secondary)',
                                    }}
                                >
                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                                    <span>{b}</span>
                                </li>
                            ))}
                        </ul>

                        {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

                        <button
                            type="button"
                            className="btn btn-primary btn-lg"
                            style={{ width: '100%' }}
                            onClick={handlePay}
                            disabled={payLoading}
                        >
                            {payLoading ? 'Opening payment…' : `Pay ₹${rupees} and unlock`}
                        </button>

                        {(claimOpen || error) && !claimSent && (
                            <div
                                style={{
                                    marginTop: '1.25rem',
                                    padding: '1rem',
                                    borderRadius: '10px',
                                    background: 'var(--bg-tertiary, rgba(127,127,127,0.1))',
                                }}
                            >
                                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>
                                    Paid, but still locked?
                                </h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    Your payment is safe. Give us the Razorpay payment id from your
                                    confirmation message or email (it looks like{' '}
                                    <code>pay_XXXXXXXXXXXX</code>) and we will verify it from the admin
                                    side.
                                </p>
                                <input
                                    className="input-field"
                                    placeholder="pay_XXXXXXXXXXXX"
                                    value={claimPaymentId}
                                    onChange={(e) => setClaimPaymentId(e.target.value.trim())}
                                    style={{ width: '100%', marginBottom: '0.6rem' }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ width: '100%' }}
                                    onClick={handleClaim}
                                    disabled={claimBusy || !claimPaymentId.trim()}
                                >
                                    {claimBusy ? 'Sending…' : 'Send this to support'}
                                </button>
                            </div>
                        )}

                        {claimSent && (
                            <div
                                style={{
                                    marginTop: '1.25rem',
                                    padding: '1rem',
                                    borderRadius: '10px',
                                    background: 'rgba(34,197,94,0.10)',
                                    border: '1px solid rgba(34,197,94,0.3)',
                                }}
                            >
                                <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>✅ Sent to support</h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                    We have your payment id. Someone will unlock your account, and you
                                    will get an email when it is done.
                                </p>
                            </div>
                        )}

                        {!claimOpen && !error && !claimSent && (
                            <button
                                type="button"
                                onClick={() => setClaimOpen(true)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    marginTop: '0.85rem',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-tertiary)',
                                    fontSize: '0.85rem',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                }}
                            >
                                Already paid but still locked?
                            </button>
                        )}

                        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            Payments are processed securely by Razorpay. The practice exam stays free.
                        </p>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
