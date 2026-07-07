// Neon Auth client — uses Better Auth under the hood via @neondatabase/auth
// createAuthClient returns the Better Auth vanilla client directly.
import { createAuthClient } from '@neondatabase/auth';

const NEON_AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL!;

export const authClient = createAuthClient(NEON_AUTH_URL);

// Helper: call an OTP endpoint directly using fetch (credentials: 'include' for cookie session)
async function neonFetch(path: string, body: object) {
    const res = await fetch(`${NEON_AUTH_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { data: null, error: { message: json?.message || json?.error || `Request failed (${res.status})` } };
    }
    return { data: json, error: null };
}

/** OTP helper functions — call the Better Auth email-otp endpoints directly */
export const emailOtp = {
    /**
     * Send a 6-digit OTP for sign-in to the given email.
     * Works for both existing and new users (sign-in type is accepted regardless of user existence).
     */
    sendSignInOtp: (email: string) =>
        neonFetch('/email-otp/send-verification-otp', { email, type: 'sign-in' }),

    /**
     * Send a 6-digit OTP for new user registration.
     * Uses 'sign-in' type (not 'email-verification') because 'email-verification'
     * requires an existing Neon Auth session — which new users on a fresh device/incognito
     * don't have, causing the OTP to never be sent.
     */
    sendVerificationOtp: (email: string) =>
        neonFetch('/email-otp/send-verification-otp', { email, type: 'sign-in' }),

    /**
     * Verify OTP and sign in — creates a session cookie.
     * Used for both login and registration verification.
     */
    signIn: (email: string, otp: string) =>
        neonFetch('/sign-in/email-otp', { email, otp }),

    /**
     * @deprecated Use signIn() instead.
     * verifyEmail() only works when a Neon Auth session already exists,
     * so it fails for new users on fresh devices.
     */
    verifyEmail: (email: string, otp: string) =>
        neonFetch('/sign-in/email-otp', { email, otp }),
};

