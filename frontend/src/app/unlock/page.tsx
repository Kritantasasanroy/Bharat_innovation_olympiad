'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const BENEFITS = [
    'Sit every published olympiad exam — no per-exam fee',
    'Unlimited practice attempts on the practice paper',
    'Full score reports and rank breakdown after each exam',
    'Downloadable certificates for every exam you complete',
];

export default function UnlockPage() {
    const router = useRouter();
    const [pass, setPass] = useState<AccessPass | null>(null);
    const [loading, setLoading] = useState(true);
    const [payLoading, setPayLoading] = useState(false);
    const [error, setError] = useState('');
    const rzpScriptLoaded = useRef(false);

    const loadPass = useCallback(async () => {
        try {
            const res = await api.get<AccessPass>('/access-pass/me');
            setPass(res.data);
        } catch (e: any) {
            setError(e.response?.data?.message || 'Could not load your access status.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadPass();
    }, [loadPass]);

    const handlePay = async () => {
        if (!rzpScriptLoaded.current) {
            setError('Payment library is still loading. Please try again in a moment.');
            return;
        }
        setPayLoading(true);
        setError('');

        try {
            const orderRes = await api.post('/access-pass/create-order');

            // Already paid (e.g. the webhook landed while this tab was open) —
            // don't open checkout and charge a second time.
            if (orderRes.data.alreadyActive) {
                await loadPass();
                setPayLoading(false);
                return;
            }

            const { orderId, amount, currency, key } = orderRes.data;

            const options = {
                key,
                amount,
                currency,
                name: 'Bharat Innovation Olympiad',
                description: 'Exam Access Pass — one payment, all exams',
                image: '/bio-logo.png',
                order_id: orderId,
                handler: async (response: any) => {
                    try {
                        await api.post('/access-pass/verify', {
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                        });
                        await loadPass();
                        router.push('/exams');
                    } catch {
                        // The webhook confirms the same payment server-side, so
                        // the pass may still activate shortly — say so rather
                        // than implying the money is lost.
                        setError(
                            'We could not confirm the payment in this tab. If it was debited, your access will unlock shortly — refresh this page.',
                        );
                        setPayLoading(false);
                    }
                },
                prefill: {
                    name: localStorage.getItem('userName') || '',
                    email: localStorage.getItem('userEmail') || '',
                },
                theme: { color: '#ffcb05' },
                modal: {
                    ondismiss: () => {
                        setPayLoading(false);
                        setError('Payment cancelled. You can try again whenever you are ready.');
                    },
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (resp: any) => {
                setPayLoading(false);
                setError(`Payment failed: ${resp.error?.description || 'Please try another method.'}`);
            });
            rzp.open();
        } catch (e: any) {
            setError(e.response?.data?.message || 'Could not start the payment. Please try again.');
            setPayLoading(false);
        }
    };

    const rupees = ((pass?.amount ?? 0) / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Script
                src="https://checkout.razorpay.com/v1/checkout.js"
                onLoad={() => { rzpScriptLoaded.current = true; }}
            />

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
                            You have full access to every olympiad exam. There is nothing more to pay.
                        </p>
                        <Link href="/exams" className="btn btn-primary btn-lg">
                            Browse Exams →
                        </Link>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '2rem' }}>
                        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.35rem' }}>Unlock all exams</h1>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            A single payment gives you access to every Bharat Innovation Olympiad exam —
                            now and in the future.
                        </p>

                        <div
                            style={{
                                display: 'flex', alignItems: 'baseline', gap: '0.5rem',
                                padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem',
                                background: 'var(--bg-tertiary, rgba(127,127,127,0.1))',
                            }}
                        >
                            <span style={{ fontSize: '2.25rem', fontWeight: 700 }}>₹{rupees}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>one-time · no renewal</span>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem' }}>
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

                        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            Payments are processed securely by Razorpay. The practice exam stays free.
                        </p>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
