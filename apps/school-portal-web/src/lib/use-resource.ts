"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api-client";
import { useAuth } from "./auth-context";

interface ResourceState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	reload: () => void;
}

/** Background poll interval, so a page reflects changes without a manual refresh. */
const POLL_INTERVAL_MS = 12_000;

/**
 * Loads one authenticated resource off the school portal's token, and keeps it
 * fresh: it re-fetches on an interval (paused while the tab is hidden) and on an
 * explicit `reload()`. Every dashboard page reads the same way, so the loading,
 * error handling, and auto-refresh live here rather than in eight copies.
 */
export function useResource<T>(fetcher: (token: string) => Promise<T>): ResourceState<T> {
	const { token } = useAuth();
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [nonce, setNonce] = useState(0);

	const reload = useCallback(() => setNonce((n) => n + 1), []);

	// `fetcher` is defined inline per page (a fresh identity each render); the
	// resource re-fetches on token change, an explicit `reload()`, or the poll.
	// biome-ignore lint/correctness/useExhaustiveDependencies: fetcher intentionally excluded
	useEffect(() => {
		if (!token) return;
		let cancelled = false;

		// `background` refreshes don't flip the spinner — the page stays put and
		// data updates in place. Only the first load (and reloads) show loading.
		const run = (background: boolean) => {
			if (!background) setLoading(true);
			setError(null);
			fetcher(token)
				.then((result) => !cancelled && setData(result))
				.catch((cause) => {
					if (cancelled) return;
					setError(cause instanceof ApiError ? cause.message : "Could not load this data.");
				})
				.finally(() => !cancelled && !background && setLoading(false));
		};

		run(false);

		const id = setInterval(() => {
			if (!cancelled && document.visibilityState === "visible") run(true);
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [token, nonce]);

	return { data, loading, error, reload };
}
