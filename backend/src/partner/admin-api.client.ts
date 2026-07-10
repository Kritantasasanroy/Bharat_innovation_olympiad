import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Server-to-server client for the admin-api partner ENGINE (Bun/Elysia,
 * Drizzle). The legacy backend orchestrates partner access: it owns the
 * credential/review record (Prisma `PartnerRequest`) and drives the engine's
 * `Partner.status` here. Since the backend is the only JWT signer, it mints a
 * short-lived staff token (`role: SUPER_ADMIN`) for these calls — that role is
 * in admin-api's recognised staff set, so `assertStaffRole` accepts it.
 */
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:4100';

export interface AdminApiApplication {
    id: string; // applicationId
    partnerId: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    status: string;
}

export type PartnerAccessStatus = 'APPROVED' | 'REJECTED' | 'REVOKED';

@Injectable()
export class PartnerAdminApiClient {
    constructor(private jwt: JwtService) {}

    private staffToken(): string {
        // admin-api's verifyJwt reads `sub` + `role`; SUPER_ADMIN is a staff role.
        return this.jwt.sign({ sub: 'system', role: 'SUPER_ADMIN' }, { expiresIn: '5m' });
    }

    private async call<T>(path: string, init: RequestInit): Promise<T> {
        let res: Response;
        try {
            res = await fetch(`${ADMIN_API_URL}${path}`, {
                ...init,
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${this.staffToken()}`,
                    ...(init.headers ?? {}),
                },
            });
        } catch {
            throw new InternalServerErrorException(
                `Partner engine (admin-api) unreachable at ${ADMIN_API_URL}.`,
            );
        }
        const body = (await res.json().catch(() => null)) as
            | { success: true; data: T }
            | { success: false; error?: { message?: string } }
            | null;
        if (!res.ok || !body || body.success === false) {
            const message =
                (body && body.success === false && body.error?.message) ||
                `admin-api ${path} failed (status ${res.status}).`;
            throw new InternalServerErrorException(message);
        }
        return body.data;
    }

    /** Create the engine application (admin-api mints partnerId + applicationId). */
    createApplication(input: {
        orgName: string;
        contactPerson: string;
        email: string;
        phone: string;
    }): Promise<AdminApiApplication> {
        return this.call<AdminApiApplication>('/partner-applications', {
            method: 'POST',
            body: JSON.stringify(input),
        });
    }

    /** Drive the engine's Partner.status — the gate portal-api checks each request. */
    setAccess(
        partnerId: string,
        status: PartnerAccessStatus,
        reason: string,
    ): Promise<{ id: string; status: string }> {
        return this.call<{ id: string; status: string }>(
            `/partners/${encodeURIComponent(partnerId)}/access`,
            { method: 'PATCH', body: JSON.stringify({ status, reason }) },
        );
    }
}
