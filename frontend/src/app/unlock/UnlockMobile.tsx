'use client';

import Link from 'next/link';

interface AccessPass {
    status: 'PENDING' | 'ACTIVE' | 'REVOKED' | null;
    isActive: boolean;
    amount: number;
    grantedAt: string | null;
}

interface Props {
    loading: boolean;
    pass: AccessPass | null;
    payLoading: boolean;
    error: string;
    rupees: string;
    claimOpen: boolean;
    claimPaymentId: string;
    claimBusy: boolean;
    claimSent: boolean;
    benefits: string[];
    onPay: () => void;
    onOpenClaim: () => void;
    onClaimPaymentIdChange: (value: string) => void;
    onClaim: () => void;
}

/**
 * The payment/unlock screen, as its own mobile screen.
 *
 * Desktop is already a single narrow card (`maxWidth: 640px`), so this isn't
 * a layout rescue the way the dashboard or landing page were. It exists
 * because the desktop card leans on a lot of small inline-styled text blocks
 * that read fine at arm's length on a laptop and cramped up close on a
 * phone; this reflows the same three states (loading / active / pay) with
 * larger type and a bottom-pinned CTA instead. All network calls, and the
 * Razorpay Checkout modal itself, stay owned by `page.tsx`.
 */
export default function UnlockMobile({
    loading,
    pass,
    payLoading,
    error,
    rupees,
    claimOpen,
    claimPaymentId,
    claimBusy,
    claimSent,
    benefits,
    onPay,
    onOpenClaim,
    onClaimPaymentIdChange,
    onClaim,
}: Props) {
    if (loading) {
        return (
            <div className="loading-container" style={{ minHeight: '60vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    if (pass?.isActive) {
        return (
            <main className="mob-page mob-unlock">
                <div className="mob-card mob-unlock__card" style={{ textAlign: 'center' }}>
                    <div className="mob-unlock__check">✓</div>
                    <h1>Your exams are unlocked</h1>
                    <p>You have full access to every olympiad exam this season. There is nothing more to pay.</p>
                    <Link href="/exams" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                        Browse Exams →
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="mob-page mob-unlock">
            <div className="mob-card mob-unlock__card">
                <h1>Unlock this season&apos;s exams</h1>
                <p className="mob-unlock__lede">
                    A single payment gives you access to every Bharat Innovation Olympiad exam for the
                    current season.
                </p>

                <div className="mob-unlock__price">
                    <span className="mob-unlock__amount">₹{rupees}</span>
                    <span>one-time · valid for this season</span>
                </div>

                <ul className="mob-unlock__benefits">
                    {benefits.map((b) => (
                        <li key={b}><span>✓</span> {b}</li>
                    ))}
                </ul>

                {error && <div className="auth-error">{error}</div>}

                <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={onPay}
                    disabled={payLoading}
                >
                    {payLoading ? 'Opening payment…' : `Pay ₹${rupees} and unlock`}
                </button>

                {(claimOpen || error) && !claimSent && (
                    <div
                        style={{
                            marginTop: '1rem',
                            padding: '0.9rem',
                            borderRadius: '10px',
                            background: 'var(--bg-tertiary, rgba(127,127,127,0.1))',
                        }}
                    >
                        <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.9rem' }}>Paid, but still locked?</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                            Give us the Razorpay payment id from your confirmation message (looks like{' '}
                            <code>pay_XXXXXXXXXXXX</code>) and we will verify it from the admin side.
                        </p>
                        <input
                            className="input-field"
                            placeholder="pay_XXXXXXXXXXXX"
                            value={claimPaymentId}
                            onChange={(e) => onClaimPaymentIdChange(e.target.value.trim())}
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: '100%' }}
                            onClick={onClaim}
                            disabled={claimBusy || !claimPaymentId.trim()}
                        >
                            {claimBusy ? 'Sending…' : 'Send this to support'}
                        </button>
                    </div>
                )}

                {claimSent && (
                    <div
                        style={{
                            marginTop: '1rem',
                            padding: '0.9rem',
                            borderRadius: '10px',
                            background: 'rgba(34,197,94,0.10)',
                            border: '1px solid rgba(34,197,94,0.3)',
                        }}
                    >
                        <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.9rem' }}>✅ Sent to support</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                            We have your payment id. Someone will unlock your account, and you will get
                            an email when it is done.
                        </p>
                    </div>
                )}

                {!claimOpen && !error && !claimSent && (
                    <button
                        type="button"
                        onClick={onOpenClaim}
                        style={{
                            display: 'block',
                            width: '100%',
                            marginTop: '0.75rem',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            fontSize: '0.82rem',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                        }}
                    >
                        Already paid but still locked?
                    </button>
                )}

                <p className="mob-auth__hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
                    Payments are processed securely by Razorpay. The practice exam stays free.
                </p>
            </div>
        </main>
    );
}
