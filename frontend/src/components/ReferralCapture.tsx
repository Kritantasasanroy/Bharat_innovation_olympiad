'use client';

import { captureReferralFromUrl } from '@/lib/referral';
import { useEffect } from 'react';

/**
 * Renders nothing — it exists so a Server Component page (the landing page) can
 * still capture a partner's `?ref=CODE` on first touch. The code is stored and
 * replayed at registration to credit the referring partner (PRD-046).
 */
export default function ReferralCapture() {
    useEffect(() => {
        captureReferralFromUrl();
    }, []);

    return null;
}
