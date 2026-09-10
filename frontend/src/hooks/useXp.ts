'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { XP_PER_EXAM_COMPLETE } from '@/lib/constants';

/**
 * The student's XP total, derived the same way the Results page shows it:
 * `XP_PER_EXAM_COMPLETE` for every completed, non-disqualified attempt.
 *
 * Kept as a derived value rather than a stored one so it cannot drift from
 * what `/attempts/results` reports. The Navbar mounts on nearly every page, so
 * the fetch is memoised at module scope with a short TTL — one request per
 * session in practice, refreshed if the student sits another exam and comes
 * back. `bump()` lets the exam-submit flow invalidate it immediately.
 */

interface XpSnapshot {
    xp: number;
    completed: number;
}

const TTL_MS = 60_000;
let cache: { at: number; value: XpSnapshot } | null = null;
let inflight: Promise<XpSnapshot> | null = null;
const listeners = new Set<(s: XpSnapshot) => void>();

async function load(): Promise<XpSnapshot> {
    const { data } = await api.get<Array<{ score?: number | null; isDisqualified?: boolean }>>(
        '/attempts/results',
    );
    const completed = (data ?? []).filter(
        (r) => typeof r.score === 'number' && !r.isDisqualified,
    ).length;
    const value: XpSnapshot = { completed, xp: completed * XP_PER_EXAM_COMPLETE };
    cache = { at: Date.now(), value };
    for (const fn of listeners) fn(value);
    return value;
}

function ensureFresh(): void {
    if (cache && Date.now() - cache.at < TTL_MS) return;
    if (inflight) return;
    inflight = load()
        .catch(() => (cache?.value ?? { xp: 0, completed: 0 }))
        .finally(() => {
            inflight = null;
        });
}

/** Drop the cache so the next `useXp` consumer refetches (call after a submit). */
export function refreshXp(): void {
    cache = null;
    ensureFresh();
}

export function useXp(): XpSnapshot & { loaded: boolean } {
    const [snap, setSnap] = useState<XpSnapshot | null>(cache?.value ?? null);

    useEffect(() => {
        listeners.add(setSnap);
        ensureFresh();
        return () => {
            listeners.delete(setSnap);
        };
    }, []);

    return { xp: snap?.xp ?? 0, completed: snap?.completed ?? 0, loaded: snap !== null };
}
