'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import FeedbackInterstitial from '@/components/FeedbackInterstitial';
import { FEEDBACK_FORMS } from '@/lib/constants';
import { useRouter } from 'next/navigation';

/**
 * Shown immediately after an exam is submitted, before the results page.
 *
 * This is the moment the experience is freshest and the only point at which a
 * beta tester can reliably be reached — once they are looking at a score, they
 * are gone. The exam player routes both its manual and auto-submit paths here.
 */
export default function ExamFeedbackPage() {
    const router = useRouter();

    return (
        <AuthGuard>
            <Navbar />
            <FeedbackInterstitial
                formUrl={FEEDBACK_FORMS.exam}
                title="How was your exam?"
                intro="Your paper is submitted and safe. We are in beta, so tell us what worked and
                       what did not — bugs, confusing questions, anything that slowed you down."
                continueLabel="Continue to my results →"
                onContinue={() => router.push('/results')}
            />
        </AuthGuard>
    );
}
