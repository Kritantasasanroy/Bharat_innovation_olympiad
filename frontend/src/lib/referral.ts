/**
 * Partner referral capture (PRD-046 attribution).
 *
 * A partner shares a link like `https://exam.bharatolympiad.in/?ref=ABC123`.
 * The code is captured the moment the student lands (they may browse for a
 * while before registering), persisted, and replayed on `POST /auth/sync`,
 * where the backend credits the signup to the referring campaign and remembers
 * the code on the User so the later paid conversion is credited too.
 */

const REFERRAL_STORAGE_KEY = 'bio.referralCode';
const REFERRAL_QUERY_PARAM = 'ref';

/**
 * If the current URL carries `?ref=CODE`, persist it. First touch wins: an
 * existing stored code is not overwritten, matching admin-api's
 * LINK_FIRST_TOUCH attribution rule.
 */
export function captureReferralFromUrl(): void {
    if (typeof window === 'undefined') return;
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

/** The stored referral code, if the student arrived via a partner link. */
export function getReferralCode(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
        return null;
    }
}

/** Clear the stored code once it has been attached to a registration. */
export function clearReferralCode(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch {
        // ignore
    }
}
