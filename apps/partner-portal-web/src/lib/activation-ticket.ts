/**
 * Carries the short-lived `verificationTicket` from `/verify` (where the
 * applicant confirms their email) back to `/apply` (where they fill in the
 * rest and submit) — the verify-first step.
 *
 * sessionStorage, not localStorage: the ticket is single-purpose and expires
 * in ~30 minutes server-side, so nothing is lost by scoping it to the tab.
 */

const STORAGE_KEY = "bio.partner.activationTicket";

export interface StoredActivationTicket {
	readonly ticket: string;
	readonly email: string;
}

export function setActivationTicket(ticket: string, email: string): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ticket, email }));
	} catch {
		// Private mode / storage disabled — the applicant just re-verifies.
	}
}

export function getActivationTicket(): StoredActivationTicket | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed?.ticket !== "string" || typeof parsed?.email !== "string") return null;
		return parsed;
	} catch {
		return null;
	}
}

export function clearActivationTicket(): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
