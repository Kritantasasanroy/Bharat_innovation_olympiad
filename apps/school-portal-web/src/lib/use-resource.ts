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

/**
 * Loads one authenticated resource off the school portal's token. Every
 * dashboard page reads the same way, so the loading and error handling lives
 * here rather than being copied eight times.
 */
export function useResource<T>(fetcher: (token: string) => Promise<T>): ResourceState<T> {
	const { token } = useAuth();
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [nonce, setNonce] = useState(0);

	const reload = useCallback(() => setNonce((n) => n + 1), []);

	// `fetcher` is defined inline per page (a fresh identity each render); the
	// resource re-fetches on token change or an explicit `reload()` bump.
	// biome-ignore lint/correctness/useExhaustiveDependencies: fetcher intentionally excluded
	useEffect(() => {
		if (!token) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetcher(token)
			.then((result) => !cancelled && setData(result))
			.catch((cause) => {
				if (cancelled) return;
				setError(cause instanceof ApiError ? cause.message : "Could not load this data.");
			})
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [token, nonce]);

	return { data, loading, error, reload };
}
