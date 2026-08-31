'use client';

import LimonAvatar from '@/components/limon/LimonAvatar';
import LimonTour from '@/components/limon/LimonTour';
import { useIsMobile } from '@/hooks/useIsMobile';
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
 *
 * ## The phone version
 *
 * The rectangular "Need help?" pill is unchanged on tablet and desktop. On a
 * phone it collided with the mobile bottom tab bar and the feedback tab's
 * edge and read as clutter at that width, so it becomes a round badge instead
 * — small enough to sit in a corner, still legible as an offer rather than
 * decoration because "NEED HELP?" and "CLICK ME" are set directly into the
 * button as curved text around Limon's face, not implied by an icon alone.
 */
export default function LimonHelp() {
    const pathname = usePathname();
    const tourId: TourId | null = tourForPath(pathname);
    const isMobile = useIsMobile();

    /** Incremented on each press; `LimonTour` opens on the change. */
    const [openSignal, setOpenSignal] = useState(0);
    const [running, setRunning] = useState(false);

    if (!tourId) return null;

    const open = () => {
        setRunning(true);
        setOpenSignal((n) => n + 1);
    };

    return (
        <>
            {/* Hidden while the tour is up: Limon is already on screen, and a
                button offering to fetch him would be nonsense. */}
            {!running && (isMobile ? (
                <button
                    type="button"
                    className="limon-help-circle"
                    onClick={open}
                    aria-haspopup="dialog"
                    aria-label="Need help? Click me . I am Limon ready to take a guided tour of this page."
                >
                    <svg className="limon-help-circle__ring" viewBox="0 0 100 100" aria-hidden="true">
                        <circle className="limon-help-circle__bg" cx="50" cy="50" r="46" />
                        <defs>
                            {/* Top: left-to-right through the top of the circle.
                                Bottom: right-to-left through the bottom, same sweep —
                                reversing the endpoints (not the sweep flag) is what
                                keeps this arc's text upright instead of upside down. */}
                            <path id="limonHelpArcTop" d="M 15,50 A 35,35 0 0 1 85,50" />
                            <path id="limonHelpArcBottom" d="M 85,50 A 35,35 0 0 1 15,50" />
                        </defs>
                        <text className="limon-help-circle__text">
                            <textPath href="#limonHelpArcTop" startOffset="50%" textAnchor="middle">
                                NEED HELP?
                            </textPath>
                        </text>
                        <text className="limon-help-circle__text">
                            <textPath href="#limonHelpArcBottom" startOffset="50%" textAnchor="middle">
                                CLICK ME
                            </textPath>
                        </text>
                    </svg>
                    <span className="limon-help-circle__face" aria-hidden="true">
                        <LimonAvatar mood="happy" size={30} />
                    </span>
                </button>
            ) : (
                <button
                    type="button"
                    className="limon-help"
                    onClick={open}
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
            ))}

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
