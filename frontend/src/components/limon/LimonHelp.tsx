'use client';

import LimonAvatar from '@/components/limon/LimonAvatar';
import LimonTour from '@/components/limon/LimonTour';
import { tourForPath, type TourId } from '@/lib/limon/tours';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * "Need help?" — Limon, on demand, on every screen.
 *
 * ## Why this exists
 *
 * The tours ran automatically, once, remembered in `localStorage`. That is the
 * right default and it is not sufficient: a student who dismissed the tour, or
 * cleared their storage, or is on a different device, or simply did not read it
 * the first time, had no way to ask for it again. Worse, the failure was silent
 * — nothing on the page suggested a guide existed at all, so "Limon never
 * appeared" and "Limon appeared and I skipped him" looked identical.
 *
 * So the offer is now permanent and visible, and pressing it **always** works:
 * the manual path deliberately ignores `tourSeen`, because a student pressing
 * "Need help?" is the single most likely person to have seen it before.
 *
 * ## Why the button says what it says
 *
 * Not a bare "?" or a floating avatar. A question mark is a guess, and a
 * character alone reads as decoration. "Need help?" states the offer in the
 * words a confused thirteen-year-old would use, and Limon's face next to it is
 * what makes the connection to the guide who then appears.
 *
 * ## Where it does not appear
 *
 * The exam player, on the same reasoning as the feedback tab: a student mid-
 * paper must not be offered anything that covers their questions while a clock
 * runs. The trial paper mounts its own tour, which is where learning the
 * interface belongs. `tourForPath` returns null for the player, so this renders
 * nothing there — a route check, not a CSS hide, so it is not focusable either.
 */
export default function LimonHelp() {
    const pathname = usePathname();
    const tourId: TourId | null = tourForPath(pathname);

    /** Incremented on each press; `LimonTour` opens on the change. */
    const [openSignal, setOpenSignal] = useState(0);
    const [running, setRunning] = useState(false);

    if (!tourId) return null;

    return (
        <>
            {/* Hidden while the tour is up: Limon is already on screen, and a
                button offering to fetch him would be nonsense. */}
            {!running && (
                <button
                    type="button"
                    className="limon-help"
                    onClick={() => {
                        setRunning(true);
                        setOpenSignal((n) => n + 1);
                    }}
                    aria-haspopup="dialog"
                >
                    <span className="limon-help__face" aria-hidden="true">
                        <LimonAvatar mood="happy" size={34} />
                    </span>
                    <span className="limon-help__label">
                        Need help?
                        <small>Show me around this page</small>
                    </span>
                </button>
            )}

            <LimonTour
                // Remounts on navigation, so the tour is always the one for the
                // page you are actually on rather than a stale script.
                key={tourId}
                tourId={tourId}
                openSignal={openSignal}
                // The automatic first-visit runs are mounted by the pages that
                // want them (registration, the dashboard). This instance exists
                // only to answer the button.
                auto={false}
                onFinish={() => setRunning(false)}
            />
        </>
    );
}
