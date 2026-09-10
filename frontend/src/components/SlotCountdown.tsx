'use client';

import { useEffect, useState } from 'react';

/**
 * "Starts in 2 days 14 hrs" — a live countdown to the student's assigned
 * sitting.
 *
 * The sitting is assigned, not chosen, and sits in a card that otherwise only
 * states a date. A date alone makes a student do the arithmetic themselves and
 * is the thing they most often get wrong about their own exam; this answers the
 * question the card was already being asked.
 *
 * Ticks once a second inside the last hour and once a minute before that — a
 * per-second re-render for something days away is wasted work, and a minute's
 * granularity is all the display shows at that range anyway.
 */
export default function SlotCountdown({
    startsAt,
    endsAt,
}: {
    startsAt: string;
    endsAt?: string | null;
}) {
    const start = new Date(startsAt).getTime();
    const end = endsAt ? new Date(endsAt).getTime() : null;
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (Number.isNaN(start)) return;
        const until = start - Date.now();
        // Under an hour to go (or already open): tick every second.
        const period = until > 60 * 60 * 1000 ? 60_000 : 1_000;
        const t = setInterval(() => setNow(Date.now()), period);
        return () => clearInterval(t);
    }, [start, now > start]); // eslint-disable-line react-hooks/exhaustive-deps -- re-arm when the window opens so the cadence changes

    if (Number.isNaN(start)) return null;

    // Window already finished.
    if (end && now >= end) return null;

    // Window is open right now.
    if (now >= start) {
        return (
            <div className="slot-countdown slot-countdown--live">
                <span className="slot-countdown__dot" aria-hidden="true" />
                Your exam window is open now
            </div>
        );
    }

    const ms = start - now;
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Only ever two units, largest first: "2 days 14 hrs", "14 hrs 30 min",
    // "30 min 12 sec". Three would be noise at every range that matters.
    const parts =
        days > 0 ? [`${days} day${days === 1 ? '' : 's'}`, `${hours} hr${hours === 1 ? '' : 's'}`]
        : hours > 0 ? [`${hours} hr${hours === 1 ? '' : 's'}`, `${minutes} min`]
        : [`${minutes} min`, `${seconds} sec`];

    const urgent = ms <= 60 * 60 * 1000;

    return (
        <div className={`slot-countdown ${urgent ? 'slot-countdown--soon' : ''}`} aria-live="polite">
            <span aria-hidden="true">⏳</span>
            Starts in <strong>{parts.join(' ')}</strong>
        </div>
    );
}
