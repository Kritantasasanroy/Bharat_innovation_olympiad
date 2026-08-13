'use client';

import { useEffect, useState } from 'react';

/** Phone-width breakpoint. Matches the `max-width: 768px` used elsewhere in globals.css. */
export const MOBILE_BREAKPOINT = 768;

/**
 * True once the viewport is phone-width, so a page can mount a dedicated
 * mobile screen instead of reflowing its desktop one.
 *
 * Starts `false` (desktop) on every render so the server-rendered markup and
 * the client's first pass match. It flips right after mount via
 * `matchMedia`, the same window-read-after-mount pattern already used by
 * `useDeviceCheck` and `TooSmallForExam` in this codebase, so the mismatch
 * is a single harmless re-render rather than a hydration warning.
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
        const update = () => setIsMobile(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, []);

    return isMobile;
}
