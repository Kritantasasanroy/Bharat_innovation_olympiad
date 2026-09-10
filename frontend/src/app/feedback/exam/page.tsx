'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import ExamRatingPrompt from '@/components/ExamRatingPrompt';
import FeedbackInterstitial from '@/components/FeedbackInterstitial';
import api from '@/lib/api';
import { releaseCamera } from '@/lib/camera';
import { FEEDBACK_FORMS } from '@/lib/constants';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * Shown immediately after an exam is submitted, before the results page.
 *
 * Two steps, in this order:
 *
 *  1. **The star rating.** "How much did you like the Innovation Olympiad?",
 *     one tap, stored in our own database. First because it is the only thing
 *     here we are certain to get an answer to, and because a rating asked after
 *     a score measures the score.
 *  2. The longer beta feedback form, unchanged.
 *
 * `?attemptId=` drives step 1 and is skipped when absent (an older link, or a
 * trial run). `?next=` carries the destination, so the player decides where the
 * student lands afterwards. Validated as a relative path: an unchecked `next`
 * is an open redirect.
 */
function ExamFeedbackInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const raw = searchParams.get('next');
    // Must start with a single "/" — `//evil.com` is protocol-relative and would
    // send a student straight off the site.
    const next = raw && /^\/(?!\/)/.test(raw) ? raw : '/results';
    const attemptId = searchParams.get('attemptId') ?? '';

    // This is the first page after the paper ends, so it is the first chance to
    // be certain the camera is off — before the student spends a minute or two
    // filling in a feedback form with the light still on. See `lib/camera.ts`.
    useEffect(() => { releaseCamera(); }, []);

    /**
     * `null` while we find out whether this attempt was already rated — a
     * reload must not ask a second time. Resolves to true/false, and to false
     * on any error so a failed lookup never blocks the student.
     */
    const [needsRating, setNeedsRating] = useState<boolean | null>(attemptId ? null : false);
    useEffect(() => {
        if (!attemptId) return;
        let alive = true;
        api.get(`/exam-feedback/attempt/${attemptId}`)
            .then((r) => { if (alive) setNeedsRating(!r.data); })
            .catch(() => { if (alive) setNeedsRating(false); });
        return () => { alive = false; };
    }, [attemptId]);

    if (needsRating === null) {
        return <div className="loading-container"><div className="spinner" /></div>;
    }

    if (needsRating) {
        return (
            <div className="container page-content animate-fade-in">
                <ExamRatingPrompt attemptId={attemptId} onDone={() => setNeedsRating(false)} />
            </div>
        );
    }

    return (
        <FeedbackInterstitial
            formUrl={FEEDBACK_FORMS.exam}
            title="How was your exam?"
            intro="Your Innovation Olympiad exam is submitted and safe. We are in beta, so tell us what worked and
                   what did not: bugs, confusing questions, anything that slowed you down."
            continueLabel="Continue →"
            onContinue={() => router.push(next)}
        />
    );
}

export default function ExamFeedbackPage() {
    return (
        <AuthGuard>
            <Navbar />
            <Suspense fallback={<div className="loading-container"><div className="spinner" /></div>}>
                <ExamFeedbackInner />
            </Suspense>
        </AuthGuard>
    );
}
