'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import FeedbackInterstitial from '@/components/FeedbackInterstitial';
import { releaseCamera } from '@/lib/camera';
import { FEEDBACK_FORMS } from '@/lib/constants';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/**
 * Shown immediately after an exam is submitted, before the results page.
 *
 * This is the moment the experience is freshest and the only point at which a
 * beta tester can reliably be reached — once they are looking at a score, they
 * are gone. The exam player routes both its manual and auto-submit paths here.
 *
 * `?next=` carries the destination, so the player decides where the student lands
 * afterwards (normally the post-submit summary for the paper they just sat).
 * Validated as a relative path: an unchecked `next` is an open redirect.
 */
function ExamFeedbackInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const raw = searchParams.get('next');
    // Must start with a single "/" — `//evil.com` is protocol-relative and would
    // send a student straight off the site.
    const next = raw && /^\/(?!\/)/.test(raw) ? raw : '/results';

    // This is the first page after the paper ends, so it is the first chance to
    // be certain the camera is off — before the student spends a minute or two
    // filling in a feedback form with the light still on. See `lib/camera.ts`.
    useEffect(() => { releaseCamera(); }, []);

    return (
        <FeedbackInterstitial
            formUrl={FEEDBACK_FORMS.exam}
            title="How was your exam?"
            intro="Your paper is submitted and safe. We are in beta, so tell us what worked and
                   what did not — bugs, confusing questions, anything that slowed you down."
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
