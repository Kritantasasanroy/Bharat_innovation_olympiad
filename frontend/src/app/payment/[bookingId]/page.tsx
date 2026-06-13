'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        Razorpay: any;
    }
}

interface BookingDetail {
    id: string;
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
    slot: {
        startsAt: string;
        endsAt: string;
        label?: string;
        examInstance: {
            exam: {
                id: string;
                title: string;
                feeAmount?: number;
            };
        };
    };
    payment?: { status: string };
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
    });
}

export default function PaymentPage({ params }: { params: Promise<{ bookingId: string }> }) {
    const { bookingId } = use(params);
    const router = useRouter();

    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [payLoading, setPayLoading] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [couponLoading, setCouponLoading] = useState(false);
    const [couponResult, setCouponResult] = useState<{ valid: boolean; discountPct?: number; reason?: string } | null>(null);
    const [finalAmount, setFinalAmount] = useState<number>(0);
    const [error, setError] = useState('');
    const rzpScriptLoaded = useRef(false);

    useEffect(() => {
        const loadBooking = async () => {
            try {
                const res = await api.get(`/bookings/${bookingId}`);
                const b: BookingDetail = res.data;
                if (b.status === 'CONFIRMED') {
                    router.replace('/payment/success?alreadyConfirmed=1');
                    return;
                }
                setBooking(b);
                setFinalAmount(b.slot.examInstance.exam.feeAmount ?? 0);
            } catch (e: any) {
                setError(e.response?.data?.message || 'Failed to load booking');
            } finally {
                setLoading(false);
            }
        };
        loadBooking();
    }, [bookingId]);

    const handleValidateCoupon = async () => {
        if (!couponCode.trim()) return;
        setCouponLoading(true);
        setCouponResult(null);
        try {
            const res = await api.get(`/coupons/validate?code=${couponCode.trim()}`);
            setCouponResult(res.data);
            if (res.data.valid && booking?.slot.examInstance.exam.feeAmount) {
                const base = booking.slot.examInstance.exam.feeAmount;
                setFinalAmount(Math.round(base * (1 - res.data.discountPct / 100)));
            }
        } catch {
            setCouponResult({ valid: false, reason: 'Validation failed' });
        } finally {
            setCouponLoading(false);
        }
    };

    const handlePay = async () => {
        setPayLoading(true);
        setError('');
        try {
            const orderRes = await api.post('/payments/create-order', {
                bookingId,
                ...(couponResult?.valid && { couponCode }),
            });

            if (orderRes.data.alreadyPaid) {
                router.replace('/payment/success?alreadyConfirmed=1');
                return;
            }

            const { orderId, amount, currency, key } = orderRes.data;
            const userName = localStorage.getItem('userName') || '';
            const userEmail = localStorage.getItem('userEmail') || '';

            const options = {
                key,
                amount,
                currency,
                name: 'Bharat Innovation Olympiad',
                description: booking?.slot.examInstance.exam.title || 'Exam Registration',
                image: '/logo.png',
                order_id: orderId,
                handler: async (response: any) => {
                    try {
                        await api.post('/payments/verify', {
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                        });
                        router.push(`/payment/success?bookingId=${bookingId}`);
                    } catch (e: any) {
                        setError('Payment verification failed. Please contact support.');
                    }
                },
                prefill: {
                    name: userName,
                    email: userEmail,
                },
                theme: { color: '#ffcb05' },
                modal: {
                    ondismiss: () => {
                        setPayLoading(false);
                        setError('Payment cancelled. You can try again.');
                    },
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (resp: any) => {
                setPayLoading(false);
                setError(`Payment failed: ${resp.error.description}`);
            });
            rzp.open();
        } catch (e: any) {
            setError(e.response?.data?.message || 'Failed to initiate payment');
            setPayLoading(false);
        }
    };

    if (loading) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => { rzpScriptLoaded.current = true; }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="spinner" />
                </div>
            </AuthGuard>
        );
    }

    const feeRupees = finalAmount / 100;
    const originalRupees = (booking?.slot.examInstance.exam.feeAmount ?? 0) / 100;
    const hasDiscount = couponResult?.valid && finalAmount < (booking?.slot.examInstance.exam.feeAmount ?? 0);

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
            <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => { rzpScriptLoaded.current = true; }} />
            <div style={{ maxWidth: '480px', margin: '3rem auto', padding: '0 1.5rem' }}>
                <button
                    onClick={() => router.back()}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                    ← Back
                </button>

                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                    Complete Registration
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                    Secure payment via Razorpay
                </p>

                {/* Booking summary */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    marginBottom: '1.5rem',
                }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                        Booking Summary
                    </div>
                    {booking ? (
                        <>
                            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                                {booking.slot.examInstance.exam.title}
                            </div>
                            {booking.slot.label && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>{booking.slot.label}</div>
                            )}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                📅 {formatDateTime(booking.slot.startsAt)}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                to {formatDateTime(booking.slot.endsAt)}
                            </div>
                        </>
                    ) : (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading booking details...</div>
                    )}
                </div>

                {/* Coupon input */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                        Coupon Code (optional)
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            value={couponCode}
                            onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponResult(null); }}
                            placeholder="e.g. BIO2026"
                            style={{
                                flex: 1,
                                background: 'var(--bg-input)',
                                border: couponResult?.valid
                                    ? '1px solid rgba(74,222,128,0.5)'
                                    : couponResult?.valid === false
                                      ? '1px solid rgba(239,68,68,0.4)'
                                      : '1px solid var(--border-default)',
                                borderRadius: '8px',
                                padding: '0.6rem 0.9rem',
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                                outline: 'none',
                                fontFamily: 'var(--font-mono, monospace)',
                                letterSpacing: '0.05em',
                            }}
                        />
                        <button
                            className="btn btn-secondary"
                            onClick={handleValidateCoupon}
                            disabled={!couponCode.trim() || couponLoading}
                            style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                        >
                            {couponLoading ? '...' : 'Apply'}
                        </button>
                    </div>
                    {couponResult && (
                        <div style={{
                            marginTop: '0.5rem',
                            fontSize: '0.82rem',
                            color: couponResult.valid ? 'var(--success-400)' : 'var(--danger-400)',
                        }}>
                            {couponResult.valid
                                ? `✓ ${couponResult.discountPct}% discount applied`
                                : `✗ ${couponResult.reason}`}
                        </div>
                    )}
                </div>

                {/* Amount breakdown */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    marginBottom: '1.5rem',
                }}>
                    {hasDiscount && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                            <span>Original amount</span>
                            <span style={{ textDecoration: 'line-through' }}>₹{originalRupees.toLocaleString('en-IN')}</span>
                        </div>
                    )}
                    {hasDiscount && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.5rem', color: 'var(--success-400)' }}>
                            <span>Discount ({couponResult?.discountPct}%)</span>
                            <span>−₹{(originalRupees - feeRupees).toLocaleString('en-IN')}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: hasDiscount ? '0.75rem' : 0, borderTop: hasDiscount ? '1px solid var(--border-subtle)' : 'none' }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>Total</span>
                        <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--primary-400)' }}>
                            ₹{feeRupees.toLocaleString('en-IN')}
                        </span>
                    </div>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        color: 'var(--danger-400)',
                        fontSize: '0.88rem',
                        marginBottom: '1.25rem',
                    }}>
                        {error}
                    </div>
                )}

                <button
                    className="btn btn-primary btn-lg"
                    onClick={handlePay}
                    disabled={payLoading || loading}
                    style={{ width: '100%', fontSize: '1rem', padding: '0.85rem' }}
                >
                    {payLoading ? 'Opening payment...' : `Pay ₹${feeRupees.toLocaleString('en-IN')}`}
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.75rem' }}>
                    Secured by Razorpay · 256-bit encryption
                </p>
            </div>
        </AuthGuard>
    );
}
