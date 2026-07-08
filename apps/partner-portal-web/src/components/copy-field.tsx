"use client";

import { useState } from "react";

/** A read-only value with a "Copy" button — used for referral share links/codes. */
export function CopyField({ label, value }: { readonly label: string; readonly value: string }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard API can be unavailable (e.g. insecure context); fail silently,
			// the value is still selectable/visible for a manual copy.
		}
	}

	return (
		<div className="copy-field">
			<span className="copy-field__label">{label}</span>
			<code className="copy-field__value">{value}</code>
			<button type="button" onClick={handleCopy} className="button button--small">
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}
