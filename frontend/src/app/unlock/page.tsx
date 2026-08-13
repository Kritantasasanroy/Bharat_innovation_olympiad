'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import UnlockMobile from './UnlockMobile';

interface AccessPass {
    status: 'PENDING' | 'ACTIVE' | 'REVOKED' | null;
    isActive: boolean;
    amount: number;
    grantedAt: string | null;
}

// The shared Razorpay payment page (the ₹1 access link). Students pay here; the
// signed webhook unlocks their account by the email/phone they enter.
const PAYMENT_URL =
    process.env.NEXT_PUBLIC_UNLOCK_PAYMENT_URL || 'https://rzp.io/rzp/ABtT74d';

// ~3 minutes of polling after the payment page is opened.
const MAX_POLLS = 45;
const POLL_MS = 4000;

const BENEFITS = [
    'Sit every published olympiad exam this season, no per-exam fee',
    'Unlimited practice attempts on the practice paper',
    'Full score reports and rank breakdown after each exam',
    'Downloadable certificates for every exam you complete',
];

export default function UnlockPage() {
    const user = useAuthStore((s) => s.user);
    const [pass, setPass] = useState<AccessPass | null>(null);
    const [loading, setLoading] = useState(true);
    const [waiting, setWaiting] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadPass = useCallback(async () => {
        const res = await api.get<AccessPass>('/access-pass/me');
        setPass(res.data);
        return res.data;
    }, []);

    useEffect(() => {
        loadPass()
            .catch((e: any) =>
                setError(e.response?.data?.message || 'Could not load your access status.'),
            )
            .finally(() => setLoading(false));
    }, [loadPass]);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        setWaiting(false);
    }, []);

    // Once the pass goes active, stop polling. Always clear the timer on unmount.
    useEffect(() => {
        if (pass?.isActive) stopPolling();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [pass?.isActive, stopPolling]);

    const startPolling = useCallback(() => {
        setWaiting(true);
        let ticks = 0;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            ticks += 1;
            try {
                const p = await loadPass();
                if (p.isActive) {
                    stopPolling();
                    return;
                }
            } catch {
                // Transient — keep polling.
            }
            if (ticks >= MAX_POLLS) stopPolling();
        }, POLL_MS);
    }, [loadPass, stopPolling]);

    const handlePay = () => {
        setError('');
        // Open the hosted ₹1 page in a new tab so this one can watch for unlock.
        window.open(PAYMENT_URL, '_blank', 'noopener,noreferrer');
        startPolling();
    };

    const handleCheckNow = async () => {
        setChecking(true);
        setError('');
        try {
            await loadPass();
        } catch (e: any) {
            setError(e.response?.data?.message || 'Could not refresh, please try again.');
        } finally {
            setChecking(false);
        }
    };

    const rupees = ((pass?.amount ?? 100) / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    const isMobile = useIsMobile();
    if (isMobile) {
        return (
            <AuthGuard allowedRoles={['STUDENT']}>
                <UnlockMobile
                    loading={loading}
                    pass={pass}
                    waiting={waiting}
                    checking={checking}
                    error={error}
                    rupees={rupees}
                    userEmail={user?.email}
                    benefits={BENEFITS}
                    onPay={handlePay}
                    onCheckNow={handleCheckNow}
                />
            </AuthGuard>
        );
    }

    return (
        <AuthGuard allowedRoles={['STUDENT']}>
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

                        {/* Matching is by the contact details entered on the hosted page, so
                            spell out exactly what to type or the webhook can't find the account. */}
                        <div
                            style={{
                                padding: '0.9rem 1rem', borderRadius: '10px', marginBottom: '1.25rem',
                                background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)',
                                fontSize: '0.9rem', color: 'var(--text-secondary)',
                            }}
                        >
                            On the payment page, enter the email your account uses
                            {user?.email ? (
                                <>: <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong></>
                            ) : null}
                            . That&apos;s how we unlock your access automatically after payment.
                        </div>

                        {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

                        {waiting ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                                    <div className="spinner" style={{ width: '18px', height: '18px' }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        Waiting for payment confirmation…
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                                    Finish the ₹{rupees} payment in the other tab. This unlocks automatically,
                                    usually within a few seconds.
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ width: '100%' }}
                                    onClick={handleCheckNow}
                                    disabled={checking}
                                >
                                    {checking ? 'Checking…' : "I've paid, check now"}
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary btn-lg"
                                style={{ width: '100%' }}
                                onClick={handlePay}
                            >
                                Pay ₹{rupees} and unlock
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
