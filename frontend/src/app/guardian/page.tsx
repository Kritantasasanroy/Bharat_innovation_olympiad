'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/**
 * The old `/guardian` URL. The page is now `/identification` — this stub only
 * exists so links in already-sent emails and saved bookmarks do not 404 under
 * the static export (which cannot do server-side redirects). It forwards the
 * query string, so `?next=` survives the hop.
 */
function RedirectInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const query = searchParams.toString();
        router.replace(`/identification${query ? `?${query}` : ''}`);
    }, [router, searchParams]);

    return (
        <div className="loading-container">
            <div className="spinner" />
        </div>
    );
}

export default function GuardianRedirect() {
    return (
        <Suspense fallback={<div className="loading-container"><div className="spinner" /></div>}>
            <RedirectInner />
        </Suspense>
    );
}
