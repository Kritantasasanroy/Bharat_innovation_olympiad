import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
    createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedPartner {
    partnerId: string;
    email: string;
    orgName: string;
}

/**
 * Authenticates a `role: PARTNER` token.
 *
 * `JwtAuthGuard` cannot be reused here: it resolves `sub` to a `User` row, and a
 * partner token's `sub` is the admin-api `Partner.id`, which is not a user. This
 * guard verifies the signature itself and then re-checks the partner is still
 * APPROVED on **every request** — so revoking a partner locks them out
 * immediately, rather than when their 24h token expires.
 */
@Injectable()
export class PartnerJwtGuard implements CanActivate {
    constructor(
        private jwt: JwtService,
        private prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const header: string | undefined = request.headers?.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) throw new UnauthorizedException('Partner authentication required.');

        let payload: { sub?: string; role?: string; email?: string };
        try {
            payload = this.jwt.verify(token);
        } catch {
            throw new UnauthorizedException('Your session has expired. Please sign in again.');
        }
        if (payload.role !== 'PARTNER' || !payload.sub) {
            throw new ForbiddenException('This endpoint is for partners.');
        }

        const partner = await this.prisma.partnerRequest.findFirst({
            where: { partnerId: payload.sub },
            select: { status: true, orgName: true, email: true },
        });
        if (!partner || partner.status !== 'APPROVED') {
            throw new ForbiddenException('Your partner access is not active.');
        }

        request.partner = {
            partnerId: payload.sub,
            email: partner.email,
            orgName: partner.orgName,
        } satisfies AuthenticatedPartner;
        return true;
    }
}

/** The partner behind the current request, as established by {@link PartnerJwtGuard}. */
export const CurrentPartner = createParamDecorator(
    (_: unknown, context: ExecutionContext): AuthenticatedPartner =>
        context.switchToHttp().getRequest().partner,
);
