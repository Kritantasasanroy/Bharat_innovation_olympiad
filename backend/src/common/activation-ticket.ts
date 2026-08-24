import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from './jwt-secret';

/**
 * Authorizes one `apply()` call after the applicant's email-verify-first step
 * succeeds (PRD: "verify email, then submit activation").
 *
 * Deliberately not a session JWT: `JwtStrategy` resolves any token bearing an
 * `email` or `role` claim into an authenticated request (falling back to
 * `{ email, isNew: true }` for an unknown address), so reusing that signer
 * here would mean a leaked ticket could authenticate as a guest session on
 * any `JwtAuthGuard` route. This ticket is verified only by `verifyActivationTicket`
 * below and carries no claim `JwtStrategy` would recognise.
 *
 * Also deliberately not persisted: replaying the same ticket twice within its
 * 30-minute window just hits the pre-existing "an application already exists
 * for this email" conflict in `apply()`, so there is nothing a one-time-use
 * record would protect against here.
 */
export type ActivationTicketKind = 'SCHOOL' | 'PARTNER';

const TICKET_TTL_MS = 30 * 60 * 1000;

interface TicketPayload {
    kind: ActivationTicketKind;
    email: string;
    exp: number;
}

/** Namespaced so this can never be substituted for (or derived from a leak of) the session-JWT secret. */
function ticketSecret(): string {
    return `activation-ticket:${getJwtSecret()}`;
}

export function issueActivationTicket(
    kind: ActivationTicketKind,
    email: string,
    now = new Date(),
): string {
    const payload: TicketPayload = { kind, email, exp: now.getTime() + TICKET_TTL_MS };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = createHmac('sha256', ticketSecret()).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

export function verifyActivationTicket(
    raw: string | null | undefined,
    kind: ActivationTicketKind,
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
