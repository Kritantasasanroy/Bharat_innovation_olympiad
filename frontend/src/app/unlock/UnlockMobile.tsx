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
    waiting: boolean;
    checking: boolean;
    error: string;
    rupees: string;
    userEmail?: string;
    benefits: string[];
    onPay: () => void;
    onCheckNow: () => void;
}

/**
 * The payment/unlock screen, as its own mobile screen.
 *
 * Desktop is already a single narrow card (`maxWidth: 640px`), so this isn't
 * a layout rescue the way the dashboard or landing page were. It exists
 * because the desktop card leans on a lot of small inline-styled text blocks
 * that read fine at arm's length on a laptop and cramped up close on a
 * phone; this reflows the same three states (loading / active / pay) with
 * larger type and a bottom-pinned CTA instead. All network calls and
 * polling stay owned by `page.tsx`.
 */
export default function UnlockMobile({
    loading, pass, waiting, checking, error, rupees, userEmail, benefits, onPay, onCheckNow,
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

                <div className="mob-unlock__note">
                    On the payment page, enter the email your account uses
                    {userEmail ? <>: <strong>{userEmail}</strong></> : null}. That&apos;s how we unlock
                    your access automatically after payment.
                </div>

                {error && <div className="auth-error">{error}</div>}

                {waiting ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                            <div className="spinner" style={{ width: '18px', height: '18px' }} />
                            <span style={{ color: 'var(--text-secondary)' }}>Waiting for payment confirmation…</span>
                        </div>
                        <p className="mob-auth__hint" style={{ marginBottom: '1rem' }}>
                            Finish the ₹{rupees} payment in the other tab. This unlocks automatically, usually
                            within a few seconds.
                        </p>
                        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onCheckNow} disabled={checking}>
                            {checking ? 'Checking…' : "I've paid, check now"}
                        </button>
                    </div>
                ) : (
                    <button type="button" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={onPay}>
                        Pay ₹{rupees} and unlock
                    </button>
                )}

                <p className="mob-auth__hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
                    Payments are processed securely by Razorpay. The practice exam stays free.
                </p>
            </div>
        </main>
    );
}
