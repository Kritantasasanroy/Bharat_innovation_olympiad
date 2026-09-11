// Neon Auth client — uses Better Auth under the hood via @neondatabase/auth
// createAuthClient returns the Better Auth vanilla client directly.
import { createAuthClient } from '@neondatabase/auth';

const NEON_AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL!;

export const authClient = createAuthClient(NEON_AUTH_URL);

/**
 * Call an OTP endpoint directly.
 *
 * `credentials: 'omit'` — never send or store the Neon session cookie.
 *
 * We use Neon Auth only to prove the student owns the email address: both call
 * sites read nothing but the error, and the account and our own JWT come from
 * `/auth/sync` and `/auth/login-sync`, which take the email in the body and are
 * documented as needing no Neon session token. So the cookie Neon sets is never
 * read by anything here.
 *
 * It is not merely unused, it is harmful. Once a student completes one sign-in,
 * that cookie is replayed on every later call and Better Auth rejects the whole
 * request with `403 {"message":"Invalid origin"}` — a message that has nothing
 * to do with the actual cause and that no amount of retrying clears, because the
 * same cookie goes out every time. Symptom: the first registration in a browser
 * works and every one after it fails. Signing out first does not help either;
 * `signOut` carries the same cookie and is rejected identically.
 *
 * It is definitely not an origin allowlist problem: with no cookie attached the
 * endpoint answers 200 to *any* origin — `http://`, `null`, no Origin header,
 * even an unrelated domain. The cookie is the trigger. Omitting it removes both
 * the failure and the thing that causes it.
 */
async function neonFetch(path: string, body: object) {
    const res = await fetch(`${NEON_AUTH_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { data: null, error: { message: json?.message || json?.error || `Request failed (${res.status})` } };
    }
    return { data: json, error: null };
}

/**
 * Who issues the email code.
 *
 * `backend` — our own API does, and delivers it through SES from a
 * `noreply@` address on our domain. `verify` becomes a no-op here: the code is
 * checked server-side by `/auth/login-sync` and `/auth/sync`, which is also
 * where it is consumed, so checking it first would burn a single-use code and
 * leave the sign-in that follows with nothing to present.
 *
 * Anything else — Neon Auth does, from its shared `auth@mail.myneon.app`
 * sender, and the browser is the only thing that checks the result.
 *
 * Must match the API's `EMAIL_OTP_PROVIDER`. If the two disagree the failure is
 * loud rather than silent: a backend expecting a code gets none and refuses the
 * login.
 */
const OTP_BY_BACKEND = process.env.NEXT_PUBLIC_EMAIL_OTP_PROVIDER === 'backend';

/**
 * Ask our own API to email a 6-digit code.
 *
 * `name` greets the student in the email instead of it reading like a
 * notice about a stranger. Registration has it — the details step validates
 * a name before this is ever called — and passes it. Sign-in never does; a
 * student signing in has typed only their email, and the API resolves the
 * name from the account itself rather than asking the browser for it.
 */
async function backendSendOtp(email: string, name?: string) {
    try {
        const { default: api } = await import('@/lib/api');
        const { data } = await api.post('/auth/email/send-otp', { email, ...(name ? { name } : {}) });
        return { data, error: null };
    } catch (e: any) {
        return {
            data: null,
            error: { message: e?.response?.data?.message || 'Could not send the code.' },
        };
    }
}

/** Ask Neon to email a 6-digit code. */
const sendOtp = (email: string, name?: string) =>
    OTP_BY_BACKEND
        ? backendSendOtp(email, name)
        : neonFetch('/email-otp/send-verification-otp', { email, type: 'sign-in' });

/** OTP helper functions — call the Better Auth email-otp endpoints directly */
export const emailOtp = {
    /**
     * Send a 6-digit OTP for sign-in to the given email.
     * Works for both existing and new users (sign-in type is accepted regardless of user existence).
     */
    sendSignInOtp: (email: string) => sendOtp(email),

    /**
     * Send a 6-digit OTP for new user registration.
     * Uses 'sign-in' type (not 'email-verification') because 'email-verification'
     * requires an existing Neon Auth session — which new users on a fresh device/incognito
     * don't have, causing the OTP to never be sent.
     */
    sendVerificationOtp: (email: string, name?: string) => sendOtp(email, name),

    /**
     * Verify the OTP. Used for both login and registration.
     *
     * Despite the endpoint name this is only ever asked "was this code right?" —
     * both call sites read the error and discard the data, and no session cookie
     * is kept (see `neonFetch`). The account and the JWT come from our own
     * `/auth/sync` and `/auth/login-sync`.
     */
    signIn: (email: string, otp: string) =>
        OTP_BY_BACKEND
            ? Promise.resolve({ data: { deferred: true }, error: null })
            : neonFetch('/sign-in/email-otp', { email, otp }),

    /**
     * @deprecated Use signIn() instead.
     * verifyEmail() only works when a Neon Auth session already exists,
     * so it fails for new users on fresh devices.
     */
    verifyEmail: (email: string, otp: string) =>
        OTP_BY_BACKEND
            ? Promise.resolve({ data: { deferred: true }, error: null })
            : neonFetch('/sign-in/email-otp', { email, otp }),
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
 * arrives. We issue and verify phone codes ourselves and deliver them by SMS
 * through an Indian gateway. Email OTP still goes through Neon, above.
 */
export const phoneOtp = {
    /**
     * Ask the backend to send a 6-digit code to a phone number.
     * `channel` is `sms` by default, or `voice` for an automated call.
     */
    sendOtp: async (phone: string, channel: 'sms' | 'voice' = 'sms') => {
        try {
            const { default: api } = await import('@/lib/api');
            const { data } = await api.post('/auth/phone/send-otp', {
                phone: normalizePhone(phone),
                channel,
            });
            return { data, error: null };
        } catch (e: any) {
            return {
                data: null,
                error: { message: e?.response?.data?.message || 'Could not send the code.' },
            };
        }
    },
};

