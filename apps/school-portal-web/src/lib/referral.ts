/**
 * Partner campaign capture for schools (PRD-046 attribution).
 *
 * A partner shares a school onboarding link like
 * `https://bio-school-portal.vercel.app/activate?ref=ref_<uuid>`. The code is
 * captured the moment a coordinator lands (they may read for a while before
 * applying), persisted, and replayed on `POST /school/apply`, where the backend
 * resolves it to the referring partner and stamps the request's
 * `submittedByPartnerId` / `submittedViaReferralCode`.
 *
 * Mirrors the student portal's `frontend/src/lib/referral.ts` — same storage
 * key and first-touch-wins rule, so a single campaign link works for both.
 */

const REFERRAL_STORAGE_KEY = "bio.referralCode";
const REFERRAL_QUERY_PARAM = "ref";

/** If the URL carries `?ref=CODE`, persist it. First touch wins. */
export function captureReferralFromUrl(): void {
	if (typeof window === "undefined") return;
	try {
		const code = new URLSearchParams(window.location.search).get(REFERRAL_QUERY_PARAM);
		if (!code) return;
		const trimmed = code.trim();
		if (!trimmed) return;
		if (window.localStorage.getItem(REFERRAL_STORAGE_KEY)) return; // first touch wins
		window.localStorage.setItem(REFERRAL_STORAGE_KEY, trimmed);
	} catch {
		// Private mode / storage disabled — attribution is best-effort.
	}
}

/** The stored referral code, if the school arrived via a partner link. */
export function getReferralCode(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(REFERRAL_STORAGE_KEY);
	} catch {
		return null;
	}
}

/** Clear the stored code once it has been attached to an application. */
export function clearReferralCode(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
	} catch {
		// ignore
	}
}
