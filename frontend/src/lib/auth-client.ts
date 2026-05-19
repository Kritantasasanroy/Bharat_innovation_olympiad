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
    /** Send a 6-digit OTP for sign-in to the given email */
    sendSignInOtp: (email: string) =>
        neonFetch('/email-otp/send-verification-otp', { email, type: 'sign-in' }),

    /** Send a 6-digit OTP for new email verification (registration) */
    sendVerificationOtp: (email: string) =>
        neonFetch('/email-otp/send-verification-otp', { email, type: 'email-verification' }),

    /** Verify OTP and sign in — creates a session cookie */
    signIn: (email: string, otp: string) =>
        neonFetch('/sign-in/email-otp', { email, otp }),

    /** Verify OTP for email verification after sign-up */
    verifyEmail: (email: string, otp: string) =>
        neonFetch('/email-otp/verify-email', { email, otp }),
};
