'use client';

import PaymentTerms from '@/components/PaymentTerms';
import api from '@/lib/api';
import { describeError } from '@/lib/errors';
import { THANK_YOU, NEXT_STEPS } from '@/lib/copy/onboarding';
import { useAuthStore } from '@/store/authStore';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        Razorpay: any;
    }
}

/**
 * The payment registration step: pay, and unlock the account.
 *
 * ## How unlocking happens
 *
 * Razorpay Checkout opens as a modal on this page — no hosted payment page to
 * redirect to, no separate tab to lose track of. On success it hands back a
 * payment id and signature synchronously; the browser sends that straight to
 * `/access-pass/verify`, which checks the signature and activates the pass in
 * the same request.
 *
 * This is also why there is nothing to "match" any more: the order this page
 * creates and the pass the verify call activates are the same student's, by
 * construction — `/access-pass/create-order` is called with this student's own
 * session. The previous flow (a single hosted ₹1 link shared by every student)
 * had no such link; a signed webhook had to guess who had paid from whatever
 * email or phone they typed on Razorpay's own page, and that webhook only ever
 * reaches one environment — so a student registered on a second, otherwise
 * identical environment had no local record of their own payment even after
 * genuinely paying. None of that applies here.
 *
 * The webhook still exists as a second, independent confirmation of the same
 * order (`payment.service.ts` matches it by `razorpayOrderId`, not by email) —
 * whichever of the two lands first wins and the other is a no-op — but it is
 * no longer load-bearing the way it was: the modal never leaves this page, so
 * there is no "closed the other tab before it fired" gap left for it to cover.
 */

interface AccessPass {
    status: 'PENDING' | 'ACTIVE' | 'REVOKED' | null;
    isActive: boolean;
    amount: number;
}

interface OrderResponse {
    alreadyActive: boolean;
    orderId?: string;
    amount?: number;
    currency?: string;
    key?: string;
}

/** A brief poll after the checkout `handler` fires, purely to cover the gap
 * between our own write landing and the next read seeing it — not a
 * substitute for the callback, which is what actually confirms payment. */
const CONFIRM_POLLS = 10;
const CONFIRM_POLL_MS = 2000;

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
    const [payLoading, setPayLoading] = useState(false);
    const [error, setError] = useState('');
    const scriptReady = useRef(false);

    // The claim path — for a student who really has been charged but whose
    // payment did not confirm automatically.
    const [claimOpen, setClaimOpen] = useState(false);
    const [claimPaymentId, setClaimPaymentId] = useState('');
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimSent, setClaimSent] = useState(false);

    const confirmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadPass = useCallback(async () => {
        const { data } = await api.get<AccessPass>('/access-pass/me');
        setPass(data);
        if (data.isActive) {
            // The roll number (and the sitting behind it) are now issued at
            // this exact moment, not at account creation — the cached user
            // from `/auth/sync` still has neither, so pull the fresh copy
            // `rollNumber` on the confirmation screen below is about to read.
            void useAuthStore.getState().loadUser();
        }
        return data;
    }, []);

    const stopConfirmPoll = useCallback(() => {
        if (confirmPollRef.current) {
            clearInterval(confirmPollRef.current);
            confirmPollRef.current = null;
        }
    }, []);

    useEffect(() => {
        loadPass()
            .catch(() =>
                setError(
                    'We could not verify your payment status. You can still pay below.',
                ),
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
                // Transient — keep polling rather than giving up on one bad response.
            }
            if (ticks >= CONFIRM_POLLS) stopConfirmPoll();
        }, CONFIRM_POLL_MS);
    }, [loadPass, stopConfirmPoll]);

    const openCheckout = useCallback(
        (order: Required<Pick<OrderResponse, 'orderId' | 'amount' | 'currency' | 'key'>>) => {
            const rzp = new window.Razorpay({
                key: order.key,
                amount: order.amount,
                currency: order.currency,
                name: 'Bharat Innovation Olympiad',
                description: 'Exam access pass',
                order_id: order.orderId,
                prefill: { email: studentEmail },
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
                        // The signature check or the write itself failed on a
                        // payment Razorpay has already told the browser succeeded —
                        // a real charge with nothing yet to show for it, so this
                        // keeps checking rather than leaving the student stuck on
                        // a plain error.
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
        [studentEmail, loadPass, confirmAfterHandler],
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
        } catch (err) {
            setError(describeError(err, 'start the payment'));
            setPayLoading(false);
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
                    Payment Confirmed! Proceed to Face Scan →
                </button>
            </div>
        );
    }

    // ── Not paid yet ──
    return (
        <div className="auth-form">
            <Script
                src="https://checkout.razorpay.com/v1/checkout.js"
                onLoad={() => {
                    scriptReady.current = true;
                }}
            />

            <div className="pay-amount">
                <span className="pay-amount__value">₹{rupees}</span>
                <span className="pay-amount__note">one-time · unlocks this season&apos;s exams</span>
            </div>

            <PaymentTerms />

            {error && <div className="auth-error">{error}</div>}

            <button
                type="button"
                className="btn btn-primary btn-lg auth-submit"
                onClick={handlePay}
                disabled={payLoading}
            >
                {payLoading ? 'Opening payment…' : `Pay ₹${rupees} and finish registering`}
            </button>

            {/* Only offered once a payment attempt has genuinely failed to
                confirm — showing it earlier would invite tickets for a payment
                that is about to land normally. */}
            {(claimOpen || error) && !claimSent && (
                <div className="pay-claim">
                    <h4>Paid, but exam is still locked?</h4>
                    <p>
                        Your payment is safe. Give us the Razorpay payment id from your confirmation
                        message or email (it looks like <code>pay_XXXXXXXXXXXX</code>) and we will
                        verify your exam schedule from the admin side.
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
                        email when it is done. You can close this page, your registration is saved.
                    </p>
                </div>
            )}

            {!claimOpen && !error && !claimSent && (
                <button type="button" className="pay-claim-link" onClick={() => setClaimOpen(true)}>
                    Already paid but still locked?
                </button>
            )}
        </div>
    );
}
