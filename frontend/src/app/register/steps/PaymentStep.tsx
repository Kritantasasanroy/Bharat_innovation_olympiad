'use client';

import PaymentTerms from '@/components/PaymentTerms';
import api from '@/lib/api';
import { THANK_YOU, NEXT_STEPS } from '@/lib/copy/onboarding';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The final registration step: pay, and unlock the account.
 *
 * ## How unlocking actually happens
 *
 * There is no in-app Razorpay checkout. The student is sent to a hosted ₹1
 * payment link; Razorpay then calls our signed webhook, which matches the payer
 * to an account by the email or phone they typed on that page and activates the
 * access pass. So this page cannot know the outcome directly — it polls
 * `/access-pass/me` and waits.
 *
 * ## Why there are three ways out
 *
 * Because the webhook is the single point of failure and it lives in someone
 * else's dashboard. If it is misconfigured, every student who pays would sit here
 * forever, having been charged. So:
 *
 *  1. automatic polling, which handles the normal case in a few seconds;
 *  2. an explicit "I've paid — check now", for when polling has given up;
 *  3. a claim form that records the Razorpay payment id and raises it with the
 *     organisers, who can grant the pass by hand.
 *
 * The third is the one that matters. It converts "charged and stuck forever" into
 * "charged and resolved within a day", which is the difference between a bug and
 * a disaster.
 */

const PAYMENT_URL =
    process.env.NEXT_PUBLIC_UNLOCK_PAYMENT_URL || 'https://rzp.io/rzp/ABtT74d';

/** ~3 minutes at 4s intervals — long enough for a slow webhook, short enough to stop. */
const MAX_POLLS = 45;
const POLL_MS = 4000;

interface AccessPass {
    status: 'PENDING' | 'ACTIVE' | 'REVOKED' | null;
    isActive: boolean;
    amount: number;
}

export default function PaymentStep({
    studentEmail,
    rollNumber,
    onDone,
}: {
    studentEmail: string;
    rollNumber?: string | null;
    onDone: () => void;
}) {
    const [pass, setPass] = useState<AccessPass | null>(null);
    const [loading, setLoading] = useState(true);
    const [waiting, setWaiting] = useState(false);
    const [pollsExhausted, setPollsExhausted] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');

    // The claim path — used only when the webhook has plainly not fired.
    const [claimOpen, setClaimOpen] = useState(false);
    const [claimPaymentId, setClaimPaymentId] = useState('');
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimSent, setClaimSent] = useState(false);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadPass = useCallback(async () => {
        const { data } = await api.get<AccessPass>('/access-pass/me');
        setPass(data);
        return data;
    }, []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        setWaiting(false);
    }, []);

    useEffect(() => {
        loadPass()
            .catch(() => setError('Could not read your payment status. You can still pay below.'))
            .finally(() => setLoading(false));
        // Always clear the timer on unmount — a poll firing after the student has
        // navigated away sets state on a dead component.
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [loadPass]);

    useEffect(() => {
        if (pass?.isActive) stopPolling();
    }, [pass?.isActive, stopPolling]);

    const startPolling = useCallback(() => {
        setWaiting(true);
        setPollsExhausted(false);
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
                // Transient — keep polling rather than giving up on one bad response.
            }
            if (ticks >= MAX_POLLS) {
                stopPolling();
                setPollsExhausted(true);
            }
        }, POLL_MS);
    }, [loadPass, stopPolling]);

    const handlePay = () => {
        setError('');
        window.open(PAYMENT_URL, '_blank', 'noopener,noreferrer');
        startPolling();
    };

    const handleCheckNow = async () => {
        setChecking(true);
        setError('');
        try {
            const p = await loadPass();
            if (!p.isActive) {
                setError(
                    'We cannot see the payment yet. If you have just paid, give it a minute and check again.',
                );
            }
        } catch {
            setError('Could not refresh — please try again.');
        } finally {
            setChecking(false);
        }
    };

    const handleClaim = async () => {
        if (!claimPaymentId.trim()) return;
        setClaimBusy(true);
        setError('');
        try {
            // Raised as a grievance rather than through a bespoke endpoint: it is
            // the student-facing queue that already exists, an admin already
            // reviews it on the grievances page, and it records a written
            // decision — which is exactly the handling this needs.
            await api.post('/grievances', {
                type: 'GRIEVANCE',
                subject: 'Paid but account still locked',
                description:
                    `Registration payment not reflected in the account.\n` +
                    `Razorpay payment id: ${claimPaymentId.trim()}\n` +
                    `Account email: ${studentEmail}\n` +
                    (rollNumber ? `Roll number: ${rollNumber}\n` : '') +
                    `\nPlease verify the payment and grant the access pass.`,
            });
            setClaimSent(true);
        } catch {
            setError(
                'Could not send that automatically. Please email the payment id to support — your payment is safe.',
            );
        } finally {
            setClaimBusy(false);
        }
    };

    const rupees = ((pass?.amount ?? 100) / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    if (loading) {
        return (
            <div className="loading-container" style={{ minHeight: '200px' }}>
                <div className="spinner" />
            </div>
        );
    }

    // ── Paid: the whole registration is done ──
    if (pass?.isActive) {
        return (
            <div className="auth-form register-done">
                <div className="register-done__badge" aria-hidden="true">🎉</div>
                <h2 className="register-done__heading">{THANK_YOU.heading}</h2>
                <p className="register-done__body">{THANK_YOU.body}</p>

                {rollNumber && (
                    <div className="register-done__roll">
                        <span className="register-done__roll-label">Your roll number</span>
                        <strong className="register-done__roll-value">{rollNumber}</strong>
                    </div>
                )}

                <ol className="next-steps">
                    {NEXT_STEPS.map((step) => (
                        <li key={step.title}>
                            <strong>{step.title}</strong>
                            <p>{step.body}</p>
                        </li>
                    ))}
                </ol>

                <button type="button" className="btn btn-primary btn-lg auth-submit" onClick={onDone}>
                    Continue →
                </button>
            </div>
        );
    }

    // ── Not paid yet ──
    return (
        <div className="auth-form">
            <div className="pay-amount">
                <span className="pay-amount__value">₹{rupees}</span>
                <span className="pay-amount__note">one-time · unlocks every exam</span>
            </div>

            <PaymentTerms />

            {/* The webhook matches by the contact details typed on Razorpay's page,
                so being explicit about which email to use is load-bearing, not
                politeness — a different email means the unlock cannot find them. */}
            <div className="pay-callout">
                On the payment page, enter this exact email address:
                <strong className="pay-callout__email">{studentEmail}</strong>
                That is how your account is unlocked automatically once you pay.
            </div>

            {error && <div className="auth-error">{error}</div>}

            {waiting ? (
                <div className="pay-waiting">
                    <div className="pay-waiting__row">
                        <div className="spinner" style={{ width: '18px', height: '18px' }} />
                        <span>Waiting for payment confirmation…</span>
                    </div>
                    <p className="input-hint">
                        Finish the ₹{rupees} payment in the other tab. This unlocks by itself, usually
                        within a few seconds.
                    </p>
                    <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={handleCheckNow}
                        disabled={checking}
                    >
                        {checking ? 'Checking…' : "I've paid — check now"}
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    className="btn btn-primary btn-lg auth-submit"
                    onClick={handlePay}
                >
                    Pay ₹{rupees} and finish registering
                </button>
            )}

            {/* Only offered once automatic detection has genuinely had its chance —
                showing it earlier would invite tickets for payments about to land. */}
            {(pollsExhausted || claimOpen) && !claimSent && (
                <div className="pay-claim">
                    <h4>Paid, but still locked?</h4>
                    <p>
                        Your payment is safe. Give us the Razorpay payment id from your confirmation
                        message or email (it looks like <code>pay_XXXXXXXXXXXX</code>) and we will
                        unlock your account by hand.
                    </p>
                    <input
                        className="input-field"
                        placeholder="pay_XXXXXXXXXXXX"
                        value={claimPaymentId}
                        onChange={(e) => setClaimPaymentId(e.target.value.trim())}
                    />
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: '0.6rem', width: '100%' }}
                        onClick={handleClaim}
                        disabled={claimBusy || !claimPaymentId.trim()}
                    >
                        {claimBusy ? 'Sending…' : 'Send this to support'}
                    </button>
                </div>
            )}

            {claimSent && (
                <div className="pay-claim pay-claim--sent">
                    <h4>✅ Sent to support</h4>
                    <p>
                        We have your payment id. Someone will unlock your account, and you will get an
                        email when it is done. You can close this page — your registration is saved.
                    </p>
                </div>
            )}

            {!pollsExhausted && !claimOpen && !claimSent && (
                <button type="button" className="pay-claim-link" onClick={() => setClaimOpen(true)}>
                    Already paid but still locked?
                </button>
            )}
        </div>
    );
}
