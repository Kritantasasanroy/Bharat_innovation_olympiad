import { ConflictException } from '@nestjs/common';

export type AccessDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

const ALLOWED_TRANSITIONS: Record<AccessDecision, readonly AccessDecision[]> = {
    PENDING: ['PENDING', 'APPROVED', 'REJECTED'],
    APPROVED: ['APPROVED', 'REVOKED'],
    REJECTED: ['REJECTED', 'APPROVED'],
    REVOKED: ['REVOKED', 'APPROVED'],
};

export function assertAccessTransition(
    current: AccessDecision,
    next: AccessDecision,
    subject: string,
): void {
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
        throw new ConflictException(
            `Cannot change ${subject} access from ${current} to ${next}. Refresh the queue and try the available action.`,
        );
    }
}

export function hasVerifiedEmail(
    status: AccessDecision,
    emailVerifiedAt: Date | null | undefined,
): boolean {
    return Boolean(emailVerifiedAt) || status === 'APPROVED';
}
