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

/**
 * Normalise a typed number to E.164 (`+91XXXXXXXXXX`).
 *
 * Mirrors `backend/src/auth/phone.helpers.ts`: Neon Auth keys its OTP on the
 * exact string sent, so "send" and "verify" must agree, and the backend looks
 * the account up by the same normalised form.
 */
export function normalizePhone(raw: string): string {
    const trimmed = (raw ?? '').trim();
    const hasPlus = trimmed.startsWith('+');
    let digits = trimmed.replace(/\D/g, '');

    if (!hasPlus) {
        if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
        if (digits.length === 10) digits = `91${digits}`;
    }
    return `+${digits}`;
}

export function isValidPhone(raw: string): boolean {
    const digits = normalizePhone(raw).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
}

/**
 * OTP helpers for phone sign-in.
 *
 * These hit *our* backend, not Neon. Neon's phone plugin accepts a send request
 * and returns 200, but its `send.otp` webhook payload carries no recipient
 * phone number, so there is no way to actually deliver the code — nothing ever
 * arrives. We issue and verify phone codes ourselves and deliver them over
 * WhatsApp (SMS to Indian numbers is carrier-blocked without DLT registration).
 * Email OTP still goes through Neon, above.
 */
export const phoneOtp = {
    /** Ask the backend to send a 6-digit code over WhatsApp. */
    sendOtp: async (phone: string) => {
        try {
            const { default: api } = await import('@/lib/api');
            const { data } = await api.post('/auth/phone/send-otp', { phone: normalizePhone(phone) });
            return { data, error: null };
        } catch (e: any) {
            return {
                data: null,
                error: { message: e?.response?.data?.message || 'Could not send the code.' },
            };
        }
    },
};

