"use client";

import { useEffect } from "react";

const DEFAULT_INTERVAL_MS = 12_000;

/**
 * Runs `load` on mount and then on an interval, so a page reflects changes made
 * elsewhere (e.g. an admin approving a school) without a manual refresh. Pauses
 * while the tab is hidden to avoid pointless background traffic.
 *
 * `load` should be a `useCallback` so its identity is stable; pass it as the
 * single dependency.
 */
export function usePoll(load: () => void | Promise<void>, intervalMs = DEFAULT_INTERVAL_MS) {
	useEffect(() => {
		void load();
		const tick = () => {
			if (document.visibilityState === "visible") void load();
		};
		const id = setInterval(tick, intervalMs);
		const onVisible = () => {
			if (document.visibilityState === "visible") void load();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [load, intervalMs]);
}
