import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
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

export interface AdminApiCampaign {
    id: string;
    partnerId: string;
    name: string;
    referralCode: string;
    linkToken: string;
    status: string;
}

export type PartnerAccessStatus = 'APPROVED' | 'REJECTED' | 'REVOKED';

/**
 * admin-api sleeps on Render's free tier and takes ~20-60s to cold start. While
 * it boots, Render's edge answers callers with 502/503/504 rather than queuing
 * them, which would otherwise fail a partner's very first application. These
 * are transient by definition, so retry them with backoff. A monitor pinging
 * `/health/live` keeps the service warm, but a cold start can still happen right
 * after a deploy, so the client must not depend on that.
 */
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_BACKOFF_MS = [1_000, 3_000, 6_000, 10_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PartnerAdminApiClient {
    private readonly logger = new Logger(PartnerAdminApiClient.name);

    constructor(private jwt: JwtService) {}

    private staffToken(): string {
        // admin-api's verifyJwt reads `sub` + `role`; SUPER_ADMIN is a staff role.
        return this.jwt.sign({ sub: 'system', role: 'SUPER_ADMIN' }, { expiresIn: '5m' });
    }

    /** One attempt. Resolves the raw Response, or null when the socket failed. */
    private async attempt(path: string, init: RequestInit): Promise<Response | null> {
        try {
            return await fetch(`${ADMIN_API_URL}${path}`, {
                ...init,
                headers: {
                    'content-type': 'application/json',
                    // Minted per attempt: a slow cold start must not outlive the token.
                    authorization: `Bearer ${this.staffToken()}`,
                    ...(init.headers ?? {}),
                },
            });
        } catch {
            return null;
        }
    }

    private async call<T>(path: string, init: RequestInit): Promise<T> {
        let res: Response | null = null;

        for (let i = 0; i <= RETRY_BACKOFF_MS.length; i += 1) {
            res = await this.attempt(path, init);

            const isColdStart = res === null || RETRY_STATUSES.has(res.status);
            if (!isColdStart) break;

            const delay = RETRY_BACKOFF_MS[i];
            if (delay === undefined) break; // retries exhausted; fall through to the error below
            this.logger.warn(
                `admin-api ${path} looks asleep (${res?.status ?? 'no response'}); retrying in ${delay}ms`,
            );
            await sleep(delay);
        }

        if (!res) {
            throw new InternalServerErrorException(
                `Partner engine (admin-api) unreachable at ${ADMIN_API_URL}.`,
            );
        }
        if (RETRY_STATUSES.has(res.status)) {
            throw new InternalServerErrorException(
                'The partner engine is starting up. Please try again in a moment.',
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

    // ── Referral attribution ────────────────────────────────────────────────
    //
    // Attribution is best-effort: a referral must never break a student's
    // registration or payment. Callers use `tryCaptureSignup` /
    // `tryCapturePaidConversion`, which swallow (and log) failures.

    /** Resolve the `?ref=CODE` a student carried in to its campaign. */
    private getCampaignByCode(code: string): Promise<AdminApiCampaign> {
        return this.call<AdminApiCampaign>(
            `/campaigns/by-code/${encodeURIComponent(code)}`,
            { method: 'GET' },
        );
    }

    /** Record a signup touch for a referred student. Never throws. */
    async tryCaptureSignup(referralCode: string, studentId: string): Promise<void> {
        try {
            const campaign = await this.getCampaignByCode(referralCode);
            await this.call(`/campaigns/${encodeURIComponent(campaign.id)}/signup`, {
                method: 'POST',
                body: JSON.stringify({ studentId }),
            });
            this.logger.log(`Attributed signup of ${studentId} to campaign ${campaign.id}`);
        } catch (error) {
            this.logger.warn(
                `Referral signup attribution skipped (code=${referralCode}): ${(error as Error).message}`,
            );
        }
    }

    /** Credit a paid conversion to the student's referring campaign. Never throws. */
    async tryCapturePaidConversion(
        referralCode: string,
        studentId: string,
        registrationId: string,
        amountPaise: number,
    ): Promise<void> {
        try {
            const campaign = await this.getCampaignByCode(referralCode);
            await this.call(`/campaigns/${encodeURIComponent(campaign.id)}/paid-conversion`, {
                method: 'POST',
                body: JSON.stringify({ studentId, registrationId, amountPaise }),
            });
            this.logger.log(`Credited paid conversion of ${studentId} to campaign ${campaign.id}`);
        } catch (error) {
            this.logger.warn(
                `Referral paid-conversion attribution skipped (code=${referralCode}): ${(error as Error).message}`,
            );
        }
    }
}
