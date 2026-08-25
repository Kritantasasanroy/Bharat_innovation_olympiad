import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from './jwt-secret';

/**
 * Authorizes one `resetPassword()` call after the account holder's OTP step
 * succeeds — same shape as `activation-ticket.ts`, kept as a separate module
 * (own HMAC namespace) so a leaked or forged reset ticket can never be
 * replayed into `apply()`, and vice versa.
 *
 * Also deliberately not persisted, for the same reason `activation-ticket.ts`
 * isn't: replaying the same ticket twice within its window just re-verifies
 * against the OTP kind's own single-use code, which is already burned.
 */
export type PasswordResetTicketKind = 'SCHOOL' | 'PARTNER';

const TICKET_TTL_MS = 30 * 60 * 1000;

interface TicketPayload {
    kind: PasswordResetTicketKind;
    email: string;
    exp: number;
}

/** Namespaced so this can never be substituted for the session-JWT or activation-ticket secret. */
function ticketSecret(): string {
    return `password-reset-ticket:${getJwtSecret()}`;
}

export function issuePasswordResetTicket(
    kind: PasswordResetTicketKind,
    email: string,
    now = new Date(),
): string {
    const payload: TicketPayload = { kind, email, exp: now.getTime() + TICKET_TTL_MS };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = createHmac('sha256', ticketSecret()).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

export function verifyPasswordResetTicket(
    raw: string | null | undefined,
    kind: PasswordResetTicketKind,
    email: string,
    now = new Date(),
): boolean {
    if (!raw) return false;
    const [encoded, sig] = raw.trim().split('.');
    if (!encoded || !sig) return false;

    const expectedSig = createHmac('sha256', ticketSecret()).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
        return false;
    }

    let payload: TicketPayload;
    try {
        payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        return false;
    }

    return (
        payload.kind === kind &&
        payload.email === email &&
        typeof payload.exp === 'number' &&
        payload.exp > now.getTime()
    );
}
