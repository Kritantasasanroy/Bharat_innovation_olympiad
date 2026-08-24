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
    caps: { maxConversions?: number } | null;
    createdAt: string;
}

export interface AdminApiPartner {
    id: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    commissionRatePct: number;
    status: string;
    createdAt: string;
}

export interface AdminApiCampaignFunnel {
    campaignId: string;
    campaignName: string;
    signups: number;
    registrations: number;
    paid: number;
}

export interface AdminApiFunnel {
    partnerId: string;
    signups: number;
    registrations: number;
    paid: number;
    byCampaign: AdminApiCampaignFunnel[];
}

export interface AdminApiCommissionLineItem {
    attributionId: string;
    campaignId: string;
    studentId: string;
    registrationId: string;
    amountPaise: number;
    commissionRatePct: number;
    commissionPaise: number;
}

export interface AdminApiStatement {
    id: string;
    partnerId: string;
    period: string;
    version: number;
    lineItems: AdminApiCommissionLineItem[];
    totalPaise: number;
    status: string;
    issuedAt: string;
}

export interface AdminApiPayout {
    id: string;
    partnerId: string;
    statementId: string;
    amountPaise: number;
    status: 'PENDING' | 'SIGNED_OFF' | 'RELEASED';
    financeSignOffApprover: string | null;
    financeSignOffAt: string | null;
    reason: string | null;
    createdAt: string;
}

export type PartnerAccessStatus = 'APPROVED' | 'REJECTED' | 'REVOKED';

/**
 * admin-api sleeps on Render's free tier. While it boots, Render's edge answers
 * callers 502/503/504 rather than queuing them. A measured cold start is ~33s,
 * so a budget must clear that with margin — an earlier 20s budget gave up mid-boot
 * and surfaced "the partner engine is starting up" to real users. A monitor
 * pinging `/health/live` keeps it warm, but a deploy always lands cold, so the
 * client cannot depend on that.
 */
const RETRY_STATUSES = new Set([502, 503, 504]);

/**
 * `patient` (~62s) is for staff-initiated calls, where waiting out a cold start
 * beats failing. `fast` never retries: it is for best-effort work on a path
 * where a human is blocked, so a sleeping engine must cost milliseconds.
 */
const BACKOFF_MS = {
    patient: [1_000, 2_000, 4_000, 8_000, 12_000, 15_000, 20_000],
    fast: [] as number[],
} as const;

type RetryPolicy = keyof typeof BACKOFF_MS;

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

    private async call<T>(
        path: string,
        init: RequestInit,
        policy: RetryPolicy = 'patient',
    ): Promise<T> {
        const backoff = BACKOFF_MS[policy];
        let res: Response | null = null;

        for (let i = 0; i <= backoff.length; i += 1) {
            res = await this.attempt(path, init);

            const isColdStart = res === null || RETRY_STATUSES.has(res.status);
            if (!isColdStart) break;

            const delay = backoff[i];
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

    // ── Engine visibility for admin (staff-initiated, so the "patient" retry
    // policy applies — an admin looking at a partner's workspace page is
    // actively waiting, and a cold engine is worth a ~60s wait rather than an
    // empty screen). Every call here is staff-scoped: `assertOwnsPartner` lets
    // any recognised admin role act on behalf of any partner. ───────────────

    /** The engine's own Partner row — commission rate, status, identity. */
    getPartner(partnerId: string): Promise<AdminApiPartner> {
        return this.call<AdminApiPartner>(`/partners/${encodeURIComponent(partnerId)}`, {
            method: 'GET',
        });
    }

    listCampaigns(partnerId: string): Promise<AdminApiCampaign[]> {
        return this.call<AdminApiCampaign[]>(
            `/partners/${encodeURIComponent(partnerId)}/campaigns`,
            { method: 'GET' },
        );
    }

    /** Staff pausing/resuming a specific campaign — the only lever short of revoking the whole partner. */
    setCampaignActive(
        partnerId: string,
        campaignId: string,
        deactivate: boolean,
    ): Promise<AdminApiCampaign> {
        return this.call<AdminApiCampaign>(
            `/partners/${encodeURIComponent(partnerId)}/campaigns/${encodeURIComponent(campaignId)}`,
            { method: 'PATCH', body: JSON.stringify({ deactivate }) },
        );
    }

    getFunnel(partnerId: string): Promise<AdminApiFunnel> {
        return this.call<AdminApiFunnel>(`/partners/${encodeURIComponent(partnerId)}/funnel`, {
            method: 'GET',
        });
    }

    listStatements(partnerId: string): Promise<AdminApiStatement[]> {
        return this.call<AdminApiStatement[]>(
            `/partners/${encodeURIComponent(partnerId)}/statements`,
            { method: 'GET' },
        );
    }

    /** Staff can trigger a statement for a partner too, e.g. to close out a period on their behalf. */
    generateStatement(partnerId: string, period: string): Promise<AdminApiStatement> {
        return this.call<AdminApiStatement>(
            `/partners/${encodeURIComponent(partnerId)}/statements`,
            { method: 'POST', body: JSON.stringify({ period }) },
        );
    }

    listPayouts(partnerId: string): Promise<AdminApiPayout[]> {
        return this.call<AdminApiPayout[]>(`/partners/${encodeURIComponent(partnerId)}/payouts`, {
            method: 'GET',
        });
    }

    /** `SIGNED_OFF` needs `approver`; `RELEASED` is blocked until sign-off is on file (finance-only route). */
    updatePayoutStatus(
        payoutId: string,
        status: 'SIGNED_OFF' | 'RELEASED',
        approver?: string,
        reason?: string,
    ): Promise<AdminApiPayout> {
        return this.call<AdminApiPayout>(`/payouts/${encodeURIComponent(payoutId)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, approver, reason }),
        });
    }

    // ── Referral attribution ────────────────────────────────────────────────
    //
    // Attribution is best-effort: a referral must never break — or delay — a
    // student's registration or payment. These run on the `fast` policy (no
    // retries) and swallow failures, and callers do not await them. Losing an
    // attribution while the engine cold-starts is the accepted trade.

    /** Resolve the `?ref=CODE` a student carried in to its campaign. */
    private getCampaignByCode(code: string): Promise<AdminApiCampaign> {
        return this.call<AdminApiCampaign>(
            `/campaigns/by-code/${encodeURIComponent(code)}`,
            { method: 'GET' },
            'fast',
        );
    }

    /**
     * Resolve a campaign referral code to the partner that owns it, so a school
     * arriving via a partner's onboarding link can be attributed to that partner
     * (`SchoolRequest.submittedByPartnerId`). Best-effort: returns `null` for an
     * unknown/inactive code or if the engine is unreachable — a bad code must
     * never fail the school's application.
     */
    async resolvePartnerIdByReferralCode(code: string): Promise<string | null> {
        try {
            const campaign = await this.getCampaignByCode(code);
            return campaign.partnerId ?? null;
        } catch (error) {
            this.logger.warn(
                `Could not resolve referral code ${code} to a partner: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Record a signup touch for a referred student. Never throws. */
    async tryCaptureSignup(referralCode: string, studentId: string): Promise<void> {
        try {
            const campaign = await this.getCampaignByCode(referralCode);
            await this.call(
                `/campaigns/${encodeURIComponent(campaign.id)}/signup`,
                { method: 'POST', body: JSON.stringify({ studentId }) },
                'fast',
            );
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
            await this.call(
                `/campaigns/${encodeURIComponent(campaign.id)}/paid-conversion`,
                {
                    method: 'POST',
                    body: JSON.stringify({ studentId, registrationId, amountPaise }),
                },
                'fast',
            );
            this.logger.log(`Credited paid conversion of ${studentId} to campaign ${campaign.id}`);
        } catch (error) {
            this.logger.warn(
                `Referral paid-conversion attribution skipped (code=${referralCode}): ${(error as Error).message}`,
            );
        }
    }
}
