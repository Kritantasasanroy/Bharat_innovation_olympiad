"use client";

import { useOnline } from "../lib/use-online";

export function ConnectionBanner() {
	const online = useOnline();
	if (online) return null;

	return (
		<div className="offline-banner" role="status" aria-live="polite">
			You are offline. Read-only data may be stale; reconnect before submitting a form.
		</div>
	);
}
