'use client';

import { Suspense, type ComponentType, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Query-parameter routing helpers.
 *
 * ## Why these exist
 *
 * The student portal is built with `output: 'export'` so it can be served as
 * static files from S3 behind CloudFront. Static export has to know every URL at
 * build time, which rules out dynamic segments whose values only exist at
 * runtime — booking ids, attempt ids, certificate numbers. Those routes were
 * therefore moved from `/admit-card/[bookingId]` to `/admit-card?bookingId=…`.
 *
 * ## Why the Suspense wrapper
 *
 * `useSearchParams()` suspends during prerender. Next.js fails the export build
 * with "useSearchParams() should be wrapped in a suspense boundary" unless every
 * page that reads it provides one. {@link withSearchParams} makes that a
 * one-liner per page instead of a hand-rolled boundary each time.
 */

/** Read one query parameter, URL-decoded. Empty string when absent. */
export function useRouteParam(name: string): string {
    const searchParams = useSearchParams();
    const raw = searchParams.get(name);
    return raw === null ? '' : decodeURIComponent(raw);
}

/**
 * Wrap a page component in the Suspense boundary `useSearchParams` requires.
 *
 * ```tsx
 * function AdmitCardPage() { const id = useRouteParam('bookingId'); … }
 * export default withSearchParams(AdmitCardPage);
 * ```
 */
export function withSearchParams<P extends object>(
    Component: ComponentType<P>,
    fallback: ReactNode = null,
): ComponentType<P> {
    function Wrapped(props: P) {
        return (
            <Suspense fallback={fallback}>
                <Component {...props} />
            </Suspense>
        );
    }
    Wrapped.displayName = `withSearchParams(${Component.displayName ?? Component.name ?? 'Component'})`;
    return Wrapped;
}
