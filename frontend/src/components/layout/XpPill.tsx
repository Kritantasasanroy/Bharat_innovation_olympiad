'use client';

import { useXp } from '@/hooks/useXp';

/**
 * The XP badge shown in the desktop navbar, the mobile top bar and the profile
 * page. One component so all three always agree on the number and its styling.
 */
export default function XpPill({ compact = false }: { compact?: boolean }) {
  const { xp, loaded } = useXp();
  return (
    <span className="xp-pill" title="XP earned across completed exams" aria-label={`${xp} XP`}>
      <span className="xp-pill__spark" aria-hidden="true">⚡</span>
      <span className="xp-pill__value">{loaded ? xp : '—'}</span>
      {!compact && <span className="xp-pill__unit">XP</span>}
    </span>
  );
}
