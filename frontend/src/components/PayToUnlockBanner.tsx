'use client';

import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * A prompt shown to any student without an active access pass: their exams are
 * locked until a one-time payment. Rendered on the dashboard and the exam list
 * so the paywall is visible before a student walks all the way into an exam.
 *
 * Renders nothing while loading or once the pass is active, so it can be dropped
 * at the top of any student page without a placeholder.
 */
export default function PayToUnlockBanner() {
    const router = useRouter();
    const [locked, setLocked] = useState(false);
    const [amountPaise, setAmountPaise] = useState(100);

    useEffect(() => {
        api.get('/access-pass/me')
            .then((r) => {
                setLocked(!r.data.isActive);
                if (typeof r.data.amount === 'number' && r.data.amount > 0) {
                    setAmountPaise(r.data.amount);
                }
            })
            .catch(() => {
                // If we cannot tell, don't nag — the exam start gate still enforces it.
            });
    }, []);

    if (!locked) return null;

    const rupees = (amountPaise / 100).toLocaleString('en-IN');

    return (
        <div
            className="glass-card"
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1.1rem 1.35rem',
                marginBottom: 'var(--space-6, 1.5rem)',
                borderLeft: '4px solid var(--color-primary, #ffcb05)',
            }}
        >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 0 }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🔒</span>
                <div>
                    <strong style={{ display: 'block' }}>Your exams are locked</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        One Rs.{rupees} payment unlocks the olympiad exam for the current season. The practice Innovation Olympiad exam stays free.
                    </span>
                </div>
            </div>
            <button
                type="button"
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap' }}
                onClick={() => router.push('/unlock')}
            >
                Pay ₹{rupees} to unlock
            </button>
        </div>
    );
}
