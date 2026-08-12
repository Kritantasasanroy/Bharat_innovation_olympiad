'use client';

import Link from 'next/link';

/**
 * The fee conditions, stated plainly.
 *
 * "Instructions on payment page (non refundable, transferable etc)."
 *
 * Shared by the registration payment step and `/unlock` so the two can never
 * disagree about what the student is agreeing to — a student who reads one set of
 * terms at registration and a different set at `/unlock` has grounds to dispute
 * either.
 */
export default function PaymentTerms({ compact = false }: { compact?: boolean }) {
    return (
        <div className="payment-terms">
            <h3 className="payment-terms__heading">Before you pay</h3>
            <ul className="payment-terms__list">
                <li>
                    <strong>One-time fee.</strong> It unlocks every published Olympiad exam on your
                    account for this season. There is no per-exam charge and nothing to renew.
                </li>
                <li>
                    <strong>Non-refundable.</strong> The fee cannot be refunded once paid, whether or
                    not you go on to sit an exam.
                </li>
                <li>
                    <strong>Non-transferable.</strong> It cannot be moved to another ward, another
                    account, or a later season.
                </li>
                <li>
                    <strong>Your schedule is separate, and final.</strong> After paying you choose a
                    sitting for each exam. Once confirmed, a schedule cannot be changed from your
                    account.
                </li>
                {!compact && (
                    <li>
                        <strong>The practice paper stays free.</strong> You can take it as many times
                        as you like, before or after paying.
                    </li>
                )}
            </ul>
            <p className="payment-terms__foot">
                Payments are processed securely by Razorpay. We never see or store your card
                details. Full detail is in the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer">
                    terms &amp; conditions
                </Link>
                .
            </p>
        </div>
    );
}
