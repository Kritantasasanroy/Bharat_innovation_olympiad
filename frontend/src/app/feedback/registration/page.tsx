'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import FeedbackInterstitial from '@/components/FeedbackInterstitial';
import { FEEDBACK_FORMS } from '@/lib/constants';
import { useRouter } from 'next/navigation';

/**
 * Shown once, immediately after registration completes (account created and
 * face enrolled), before the student reaches their dashboard.
 *
 * Registration is the step most likely to have gone wrong for a beta tester —
 * OTPs, school lookup, camera permissions — and the only reliable time to ask
 * is while it is still in front of them.
 */
export default function RegistrationFeedbackPage() {
    const router = useRouter();

    return (
        <AuthGuard>
            <Navbar />
            <FeedbackInterstitial
                formUrl={FEEDBACK_FORMS.registration}
                title="You're registered — welcome aboard"
                intro="Before you head to your dashboard: how did signing up go? We are in beta, so
                       anything that was confusing or broken is worth telling us about."
                continueLabel="Go to my dashboard →"
                onContinue={() => router.push('/dashboard')}
            />
        </AuthGuard>
    );
}
